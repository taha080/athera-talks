// Pure validation for creator premium grants. Kept separate from the
// Supabase call in liveBackend so it can be unit tested in Node.
export function normalizeGrantUsername(username: string): string {
  return username.trim().replace(/^@+/, '').toLowerCase()
}

export function grantDaysIssue(days: number): string | null {
  if (!Number.isInteger(days) || days < 1 || days > 365) return 'Choose between 1 and 365 days.'
  return null
}

export function grantPremiumUntil(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000)
}
