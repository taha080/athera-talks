import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readSupabaseEnv } from './config'

let client: SupabaseClient | null = null

// Created only when the keys look real, so a missing .env cannot crash the app.
export function getSupabase(): SupabaseClient | null {
  const { url, anonKey, configured } = readSupabaseEnv()
  if (!configured) return null
  if (!client) {
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    })
  }
  return client
}
