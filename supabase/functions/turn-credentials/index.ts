import { createClient } from 'jsr:@supabase/supabase-js@2'

// Deploy: Supabase MCP deploy_edge_function, project jvjgouivqzklfzshmdti,
// name turn-credentials, verify_jwt true, entrypoint index.ts.
// Secret (never a VITE_ var): METERED_API_KEY

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

  const apiKey = Deno.env.get('METERED_API_KEY') ?? ''
  if (!apiKey) return json({ error: 'TURN relay is not configured.' }, 503)

  const response = await fetch(`${METERED_CREDENTIALS_URL}?apiKey=${encodeURIComponent(apiKey)}`)
  if (!response.ok) return json({ error: 'Could not get a voice relay.' }, 502)

  const iceServers = normalizeIceServers(await response.json())
  if (!iceServers.length) return json({ error: 'Could not get a voice relay.' }, 502)
  return json({ iceServers })
})
