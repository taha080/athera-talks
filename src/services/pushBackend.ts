// Supabase-backed push subscriptions. This is only used when the push
// migration has been applied; otherwise the first query throws
// PushNotReadyError and the feature reports "not set up yet" instead of
// crashing (see lib/push.ts).
//
// Table names match supabase/migrations/20261116120000_push_subscriptions.sql.
// No secret is read here: only the browser anon key via getSupabase().
// The endpoint URL and the two encryption keys are what the push server
// needs; no message content is ever stored in this table.

import { getSupabase } from '../lib/supabase'

export class PushNotReadyError extends Error {
  constructor() {
    super('Push notifications are not set up yet.')
    this.name = 'PushNotReadyError'
  }
}

function isMissingTable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const code = (error as { code?: string })?.code
  return code === '42P01' || code === 'PGRST205' || /relation .* does not exist|Could not find the table|PGRST205/i.test(message)
}

function notReady(error: unknown): never {
  if (isMissingTable(error)) throw new PushNotReadyError()
  throw new Error(pushErrorMessage(error))
}

// PostgREST errors are plain objects ({ message, code, ... }), not Error
// instances, so `instanceof Error` hid the real message behind a generic
// text. Keep the real message so the next failure can be diagnosed.
export function pushErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  const message = (error as { message?: unknown })?.message
  if (typeof message === 'string' && message) return message
  return 'Push notifications could not be saved.'
}

function subscriptionKeys(subscription: PushSubscription): { p256dh: string; auth: string } {
  const json = subscription.toJSON() as { keys?: { p256dh?: string; auth?: string } }
  return { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' }
}

// One row per endpoint. Re-saving the same device updates its keys
// instead of adding a duplicate row. The device label comes from the
// caller (lib/push.ts, deviceLabel) — only browser and OS family.
export async function savePushSubscription(userId: string, subscription: PushSubscription, device: string): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured.')
  const { p256dh, auth } = subscriptionKeys(subscription)
  if (!p256dh || !auth) throw new Error('This browser did not provide push encryption keys.')
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id: userId,
        endpoint: subscription.endpoint,
        p256dh,
        auth,
        device: device.slice(0, 120),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    )
  if (error) notReady(error)
}

export async function hasPushSubscription(userId: string, endpoint: string): Promise<boolean> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('id')
    .eq('user_id', userId)
    .eq('endpoint', endpoint)
    .maybeSingle()
  if (error) notReady(error)
  return data !== null
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  if (error) notReady(error)
}
