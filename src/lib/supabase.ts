import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readSupabaseEnv } from './config'

let client: SupabaseClient | null = null

// Created only when the keys look real, so a missing .env cannot crash the app.
export function getSupabase(): SupabaseClient | null {
  const { url, anonKey, configured } = readSupabaseEnv()
  if (!configured) return null
  if (!client) {
    const auth = {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce' as const,
    }
    try {
      // A worker sends heartbeats while the tab is backgrounded, so call
      // signalling is not dropped when Android freezes page timers.
      client = createClient(url, anonKey, { auth, realtime: { worker: true } })
    } catch {
      client = createClient(url, anonKey, { auth })
    }
  }
  return client
}
