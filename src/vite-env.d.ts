/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** "true" after the Google provider is enabled in Supabase Auth. */
  readonly VITE_SUPABASE_GOOGLE_ENABLED?: string
  /** Comma-separated TURN URLs. "none" disables the relay. Blank asks the turn-credentials function. */
  readonly VITE_TURN_URLS?: string
  readonly VITE_TURN_USERNAME?: string
  readonly VITE_TURN_CREDENTIAL?: string
  readonly VITE_TURN_SECRET?: string
  readonly BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
