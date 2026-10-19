export function routerBasename(baseUrl: string): string | undefined {
  if (!baseUrl || baseUrl === '/') return undefined
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
}

// Full URL Supabase redirects back to after Google or a password reset email.
export function appUrl(path = '/'): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  const suffix = path.startsWith('/') ? path : `/${path}`
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  if (suffix === '/') return `${origin}${base}/`
  return `${origin}${base}${suffix}`
}
