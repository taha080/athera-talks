export function isPremiumUntil(until: string | null | undefined, now = Date.now()): boolean {
  if (!until) return false
  const time = Date.parse(until)
  return Number.isFinite(time) && time > now
}

// Active when the start is open or already reached, and the end is still ahead.
export function isPremiumWindow(
  from: string | null | undefined,
  until: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!isPremiumUntil(until, now)) return false
  if (!from) return true
  const start = Date.parse(from)
  return Number.isFinite(start) && start <= now
}

export function isGifAvatarUrl(url: string | null | undefined): boolean {
  if (!url) return false
  return /\.gif($|[?#])/i.test(url) || /^data:image\/gif/i.test(url)
}

export function hasPremium(
  person: { isPremium?: boolean | null; premiumFrom?: string | null; premiumUntil?: string | null } | null | undefined,
  now = Date.now(),
): boolean {
  if (!person) return false
  if (person.premiumUntil != null || person.premiumFrom != null) {
    return isPremiumWindow(person.premiumFrom, person.premiumUntil, now)
  }
  return person.isPremium === true
}

// A GIF keeps moving only while the account is the creator or still premium.
export function avatarAnimates(url: string | null | undefined, creator: boolean, premium: boolean): boolean {
  if (!url || !isGifAvatarUrl(url)) return true
  return creator || premium
}
