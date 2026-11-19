export const TYPING_TTL_MS = 3500
export const TYPING_THROTTLE_MS = 1500

// Supabase user ids are UUIDs. Broadcast channels are not authenticated
// per-sender, so a typing payload is only trusted when its sender id looks
// like a real user id — anything else (a display name, a made-up id, a
// non-string) is spoofed or malformed and is dropped. The receiver can
// never prove a peer's id from the payload alone; the sender side binds
// the id to the authenticated session instead (see broadcastTyping in
// services/liveBackend.ts, which uses currentUserId()). Full per-sender
// authorization needs Supabase Realtime Authorization (private channels
// plus RLS on realtime.messages) — a server-side migration, not a client
// change — so this validation is defence-in-depth, not a proof of sender.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUserId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

export function parseTypingPayload(
  payload: unknown,
  ownUserId: string | null,
): { userId: string; typing: boolean } | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  const userId = record.userId
  if (!isUserId(userId)) return null
  // Our own broadcast echoes back on the channel; it is not a peer typing.
  if (ownUserId && userId === ownUserId) return null
  const typing = !('typing' in record) || record.typing !== false
  return { userId, typing }
}

export function shouldAnnounceTyping(text: string, lastSentAt: number, now: number, throttleMs = TYPING_THROTTLE_MS): boolean {
  if (!text.trim()) return false
  return now - lastSentAt >= throttleMs
}
