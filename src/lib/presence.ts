import { formatListTime } from './format'

const ONLINE_MS = 45_000

export function isOnline(lastSeenAt: string | null | undefined, now = Date.now()): boolean {
  if (!lastSeenAt) return false
  const time = new Date(lastSeenAt).getTime()
  return Number.isFinite(time) && now - time >= 0 && now - time < ONLINE_MS
}

export function presenceLabel(lastSeenAt: string | null | undefined, now = Date.now()): string {
  if (!lastSeenAt) return ''
  if (isOnline(lastSeenAt, now)) return 'online'
  const delta = now - new Date(lastSeenAt).getTime()
  if (delta < 60_000) return 'last seen just now'
  if (delta < 60 * 60_000) return `last seen ${Math.max(1, Math.floor(delta / 60_000))}m ago`
  if (delta < 24 * 60 * 60_000) return `last seen ${Math.floor(delta / (60 * 60_000))}h ago`
  return `last seen ${formatListTime(lastSeenAt, new Date(now))}`
}
