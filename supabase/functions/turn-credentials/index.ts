import { createClient } from 'jsr:@supabase/supabase-js@2'

// L18 (deep security audit): per-user TURN quota. Any signed-in user
// could previously fetch fresh Metered TURN credentials without limit,
// so one account could burn the shared Metered quota for everyone.
// An in-memory counter cannot work here: Edge Functions are stateless
// and ephemeral, so the counter lives in Postgres instead — the same
// public.rate_limits table created by
// supabase/migrations/20261119140000_rate_limiting.sql — via the
// service-role-only RPC public.check_rate_limit_for(). The limit is
// 30 credential fetches per user per hour: a fetch happens once per call
// setup (src/lib/webrtc.ts fetchTurnIceServers), so 30/hour is generous
// for a human and only stops quota abuse.
// Option (b) from the audit — requiring a call context — was NOT used:
// the app calls this function with no body at all
// (supabase.functions.invoke('turn-credentials')), so there is no
// conversation/call id to verify without an app change. If the app later
// passes a call id, the function can additionally verify participation.
// DEPLOY ORDER: apply migration 20261119140000_rate_limiting.sql to the
// live Supabase project BEFORE deploying this function — until the table
// and RPC exist, the quota check below fails closed (503) and no TURN
// credentials are issued. That is deliberate: fail closed, not open.
// Deploy: Supabase MCP deploy_edge_function, project jvjgouivqzklfzshmdti,
// name turn-credentials, verify_jwt true, entrypoint index.ts.
// Secrets (never a VITE_ var): METERED_API_KEY, SUPABASE_SERVICE_ROLE_KEY
// (injected by Supabase).
const TURN_CREDENTIALS_PER_HOUR = 30

async function checkTurnQuota(
  url: string,
  serviceRoleKey: string,
  userId: string,
): Promise<{ limited: boolean; unavailable: boolean }> {
  const admin = createClient(url, serviceRoleKey)
  const { error } = await admin.rpc('check_rate_limit_for', {
    p_user_id: userId,
    p_action: 'turn-credentials',
    p_max: TURN_CREDENTIALS_PER_HOUR,
    p_window_seconds: 3600,
  })
  if (!error) return { limited: false, unavailable: false }
  // The RPC raises 'Rate limit exceeded ...' when the user is over quota.
  if (typeof error.message === 'string' && error.message.includes('Rate limit exceeded')) {
    return { limited: true, unavailable: false }
  }
  console.error('turn-credentials quota check failed:', error.message)
  return { limited: false, unavailable: true }
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const METERED_CREDENTIALS_URL = 'https://taha-turn-996755.metered.live/api/v1/turn/credentials'

type IceServer = {
  urls: string | string[]
  username?: string
  credential?: string
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

// Some relays advertise port 53. Browsers time out on it. 5349 is a real TURNS port.
function usable(url: string): boolean {
  return !/:53(?:\?|$)/.test(url)
}

function asList(body: unknown): unknown[] {
  if (Array.isArray(body)) return body
  if (body && typeof body === 'object' && Array.isArray((body as { iceServers?: unknown }).iceServers)) {
    return (body as { iceServers: unknown[] }).iceServers
  }
  return []
}

function normalizeIceServers(body: unknown): IceServer[] {
  const iceServers: IceServer[] = []
  for (const item of asList(body)) {
    if (!item || typeof item !== 'object') continue
    const server = item as { urls?: unknown; username?: unknown; credential?: unknown }
    const urls = (Array.isArray(server.urls) ? server.urls : server.urls ? [server.urls] : []).filter(
      (url): url is string => typeof url === 'string' && usable(url),
    )
    if (!urls.length) continue
    const next: IceServer = { urls: urls.length === 1 ? urls[0] : urls }
    if (typeof server.username === 'string' && server.username) next.username = server.username
    if (typeof server.credential === 'string' && server.credential) next.credential = server.credential
    iceServers.push(next)
  }
  return iceServers
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only.' }, 405)

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const auth = req.headers.get('Authorization') ?? ''
  if (!url || !anon || !auth) return json({ error: 'Sign in required.' }, 401)

  const supabase = createClient(url, anon, { global: { headers: { Authorization: auth } } })
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) return json({ error: 'Sign in required.' }, 401)

  // Per-user TURN quota (L18). Fail closed: if the quota table/RPC is not
  // in place yet (migration not applied) or the service-role key is missing,
  // refuse rather than handing out unlimited relay credentials.
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!serviceRoleKey) return json({ error: 'Voice relay is not configured.' }, 503)
  const quota = await checkTurnQuota(url, serviceRoleKey, userData.user.id)
  if (quota.limited) {
    return json({ error: 'Too many voice relay requests. Try again later.' }, 429)
  }
  if (quota.unavailable) {
    return json({ error: 'Voice relay is temporarily unavailable.' }, 503)
  }

  const apiKey = Deno.env.get('METERED_API_KEY') ?? ''
  if (!apiKey) return json({ error: 'TURN relay is not configured.' }, 503)

  const response = await fetch(`${METERED_CREDENTIALS_URL}?apiKey=${encodeURIComponent(apiKey)}`)
  if (!response.ok) return json({ error: 'Could not get a voice relay.' }, 502)

  const iceServers = normalizeIceServers(await response.json())
  if (!iceServers.length) return json({ error: 'Could not get a voice relay.' }, 502)
  return json({ iceServers })
})
