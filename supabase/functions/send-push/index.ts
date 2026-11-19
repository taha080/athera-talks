// send-push — Supabase Edge Function (Deno).
//
// Called by a Supabase Database Webhook on INSERT into public.messages.
// It finds every other member of that conversation, loads their push
// subscriptions, and sends each one a Web Push notification (sender name
// + short preview) via the web-push protocol (see webpush.ts — VAPID +
// RFC 8291 encryption, WebCrypto only, no npm dependencies).
//
// Deploy: supabase functions deploy send-push --no-verify-jwt
// (verify_jwt must be OFF: a database webhook cannot present a Supabase
// user JWT. The webhook proves itself with the shared secret below.)
//
// Secrets (Supabase Dashboard -> Edge Functions -> Secrets, or
// `supabase secrets set`):
//   VAPID_PUBLIC_KEY   base64url 65-byte point (also in src/lib/push.ts)
//   VAPID_PRIVATE_KEY  base64url 32-byte scalar — NEVER commit this
//   VAPID_SUBJECT      who sends the push, e.g. https://taha080.github.io/athera-talks/
//   PUSH_WEBHOOK_SECRET  shared secret; the database webhook must send
//                      it as the `x-webhook-secret` header
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by Supabase.
//
// Webhook (Supabase Dashboard -> Database -> Webhooks -> Create):
//   Table: public.messages, Events: INSERT, Method: POST,
//   URL: https://<project-ref>.supabase.co/functions/v1/send-push
//   HTTP Headers: x-webhook-secret: <same PUSH_WEBHOOK_SECRET>
//   (plus Content-Type: application/json, added automatically)
//
// Behaviour:
//  * One notification per recipient per message. A muted conversation
//    (chat_prefs.muted) gets nothing for that person.
//  * Deleted messages are skipped. Group chats notify every member
//    except the sender, with "Sender in Group name" as the title.
//  * The payload carries the recipient's total unread count as
//    `unreadCount`, so the service worker can put the number on the
//    app icon (Badging API). When the count cannot be determined the
//    field is left out and the worker shows a plain dot instead — a
//    missing count is never guessed.
//  * A subscription whose push endpoint answers 404 or 410 is expired
//    and is deleted, so dead devices stop being retried.
//  * No message content is stored anywhere by this function.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { encryptPushPayload, type PushSubscriptionKeys, type VapidKeys } from './webpush.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

type MessageRecord = {
  id?: string
  conversation_id?: string
  sender_id?: string
  body?: string | null
  kind?: string | null
  deleted_at?: string | null
}

function previewText(record: MessageRecord): string {
  const body = (record.body ?? '').trim()
  if (body) return body.length > 100 ? `${body.slice(0, 100)}…` : body
  if (record.kind === 'voice') return 'Voice message'
  if (record.kind === 'image') return 'Photo'
  if (record.kind === 'video') return 'Video'
  return 'New message'
}

// The recipient's TOTAL unread count, mirroring exactly what the app
// itself shows: the sum of the per-conversation `unread` counts from
// list_my_conversations() — messages in conversations the user is a
// member of, sent by someone else, never read, not deleted, and not
// hidden by the user. Returns null when the count cannot be determined
// (the push is still sent, just without a count).
async function totalUnreadCount(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<number | null> {
  const { data: memberships, error: membersError } = await supabase
    .from('conversation_members')
    .select('conversation_id')
    .eq('user_id', userId)
  if (membersError) return null
  const conversationIds = ((memberships ?? []) as { conversation_id: string }[])
    .map((row) => row.conversation_id)
  if (conversationIds.length === 0) return 0
  // PostgREST count queries are GETs, so keep the URL short: with too
  // many conversations to list, or too many hidden messages to exclude,
  // report "unknown" instead of risking a failed query.
  if (conversationIds.length > 200) return null

  const { data: hidden, error: hiddenError } = await supabase
    .from('message_hides')
    .select('message_id')
    .eq('user_id', userId)
  if (hiddenError) return null
  const hiddenIds = ((hidden ?? []) as { message_id: string }[]).map((row) => row.message_id)
  if (hiddenIds.length > 500) return null

  const base = supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .in('conversation_id', conversationIds)
    .neq('sender_id', userId)
    .is('read_at', null)
    .is('deleted_at', null)
  const { count, error } = hiddenIds.length > 0
    ? await base.not('id', 'in', `(${hiddenIds.join(',')})`)
    : await base
  if (error) return null
  return count ?? 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only.' }, 405)

  const secret = Deno.env.get('PUSH_WEBHOOK_SECRET') ?? ''
  if (!secret || req.headers.get('x-webhook-secret') !== secret) {
    return json({ error: 'Unauthorized.' }, 401)
  }

  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'https://taha080.github.io/athera-talks/'
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!vapidPublicKey || !vapidPrivateKey || !supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Push is not configured (missing secrets).' }, 500)
  }
  const vapidKeys: VapidKeys = { publicKey: vapidPublicKey, privateKey: vapidPrivateKey }

  let payload: { type?: string; record?: MessageRecord }
  try {
    payload = await req.json() as { type?: string; record?: MessageRecord }
  } catch {
    return json({ error: 'Invalid JSON.' }, 400)
  }
  if (payload.type !== 'INSERT') return json({ skipped: 'not an insert' })
  const record = payload.record ?? {}
  if (record.deleted_at) return json({ skipped: 'deleted message' })
  if (!record.id || !record.conversation_id || !record.sender_id) {
    return json({ error: 'Message record is missing id, conversation or sender.' }, 400)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const { data: sender } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', record.sender_id)
    .maybeSingle()
  const senderName = (sender as { username?: string } | null)?.username ?? 'Someone'

  const { data: conversation } = await supabase
    .from('conversations')
    .select('kind, title')
    .eq('id', record.conversation_id)
    .maybeSingle()
  const convo = conversation as { kind?: string | null; title?: string | null } | null
  const isGroup = convo?.kind !== 'direct'
  const title = isGroup
    ? `${senderName} in ${convo?.title?.trim() ? convo.title : 'Group chat'}`
    : senderName

  const { data: members } = await supabase
    .from('conversation_members')
    .select('user_id')
    .eq('conversation_id', record.conversation_id)
    .neq('user_id', record.sender_id)
  const recipientIds = ((members ?? []) as { user_id: string }[]).map((row) => row.user_id)
  if (recipientIds.length === 0) return json({ sent: 0, expired: 0, failed: 0 })

  const baseMessage = {
    title,
    body: previewText(record),
    conversationId: record.conversation_id,
    messageId: record.id,
  }

  let sent = 0
  let expired = 0
  let failed = 0
  for (const recipientId of recipientIds) {
    const { data: pref } = await supabase
      .from('chat_prefs')
      .select('muted')
      .eq('user_id', recipientId)
      .eq('conversation_id', record.conversation_id)
      .maybeSingle()
    if ((pref as { muted?: boolean } | null)?.muted) continue

    // One payload per recipient: the badge count is theirs alone.
    const unreadCount = await totalUnreadCount(supabase, recipientId)
    const message = unreadCount === null ? baseMessage : { ...baseMessage, unreadCount }
    const text = JSON.stringify(message)

    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', recipientId)
    const rows = ((subscriptions ?? []) as PushSubscriptionKeys[])
    for (const row of rows) {
      // Log each endpoint's outcome (last 12 chars only — enough to tell
      // devices apart in the logs without printing the full endpoint).
      // The dashboard shows only the HTTP 200 of this function, so without
      // these lines a failing phone endpoint is invisible.
      const fingerprint = row.endpoint.slice(-12)
      try {
        const { body, headers } = await encryptPushPayload(row, text, vapidKeys, vapidSubject)
        const response = await fetch(row.endpoint, { method: 'POST', headers, body: body as BodyInit })
        if (response.status === 404 || response.status === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', row.endpoint)
          expired++
          console.log(`send-push endpoint ...${fingerprint} status=${response.status} expired`)
        } else if (response.ok) {
          sent++
          console.log(`send-push endpoint ...${fingerprint} status=${response.status} sent`)
        } else {
          failed++
          console.log(`send-push endpoint ...${fingerprint} status=${response.status} failed`)
        }
      } catch (error) {
        failed++
        console.log(
          `send-push endpoint ...${fingerprint} error=${error instanceof Error ? error.message : 'unknown'} failed`,
        )
      }
    }
  }
  console.log(`send-push message=${record.id} sent=${sent} expired=${expired} failed=${failed}`)
  return json({ sent, expired, failed })
})
