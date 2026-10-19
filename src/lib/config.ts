// A copied .env.example still has these placeholders, so treat them as "not set".
const PLACEHOLDER_URL = 'your-project'
const PLACEHOLDER_KEY = 'your-anon-key'

export function isSupabaseConfigured(url?: string, anonKey?: string): boolean {
  const cleanUrl = (url ?? '').trim()
  const cleanKey = (anonKey ?? '').trim()
  if (!cleanUrl || !cleanKey) return false
  if (cleanUrl.includes(PLACEHOLDER_URL) || cleanKey.includes(PLACEHOLDER_KEY)) return false
  try {
    const parsed = new URL(cleanUrl)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
  } catch {
    return false
  }
  return cleanKey.length >= 20
}

export function readSupabaseEnv(): { url: string; anonKey: string; configured: boolean } {
  const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
  const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()
  return { url, anonKey, configured: isSupabaseConfigured(url, anonKey) }
}
