export const TYPING_TTL_MS = 3500
export const TYPING_THROTTLE_MS = 1500

export function shouldAnnounceTyping(text: string, lastSentAt: number, now: number, throttleMs = TYPING_THROTTLE_MS): boolean {
  if (!text.trim()) return false
  return now - lastSentAt >= throttleMs
}
