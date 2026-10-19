export type GoogleAuthMode = 'ready' | 'disabled'

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase()
}

export function usernameIssue(value: string): string | null {
  const name = normalizeUsername(value)
  if (!name) return 'Choose a username.'
  if (!/^[a-z0-9_]{3,20}$/.test(name)) {
    return 'Use 3–20 letters, numbers, or underscores.'
  }
  return null
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export function passwordIssue(password: string): string | null {
  if (password.length < 6) return 'Use at least 6 characters.'
  if (password.length > 72) return 'Use 72 characters or fewer.'
  return null
}

// Demo mode always offers a pretend Google button so the landing can be previewed.
// Live mode waits for VITE_SUPABASE_GOOGLE_ENABLED so a missing provider cannot fail the click.
export function googleAuthMode(flag: string | undefined, demo: boolean): GoogleAuthMode {
  if (demo) return 'ready'
  const value = (flag ?? '').trim().toLowerCase()
  if (value === 'true' || value === '1' || value === 'yes') return 'ready'
  return 'disabled'
}

export function googleSignInError(message: string): string {
  if (/provider is not enabled|unsupported provider|validation_failed/i.test(message)) {
    return 'Google sign-in is not enabled in this Supabase project yet. Use email instead.'
  }
  return message
}
