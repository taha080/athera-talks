export function routerBasename(baseUrl: string): string | undefined {
  if (!baseUrl || baseUrl === '/') return undefined
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
}

// Password emails always return to the live site, never localhost or the Supabase Site URL.
export const PASSWORD_RESET_REDIRECT = 'https://taha080.github.io/ta-talk/'

export function isPasswordRecoveryUrl(href: string): boolean {
  try {
    const url = new URL(href)
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
    return hash.get('type') === 'recovery' || url.searchParams.get('type') === 'recovery'
  } catch {
    return false
  }
}

// Full URL Supabase redirects back to after Google sign-in.
export function appUrl(path = '/'): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  const suffix = path.startsWith('/') ? path : `/${path}`
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  if (suffix === '/') return `${origin}${base}/`
  return `${origin}${base}${suffix}`
}
