import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const TTL_SECONDS = 86_400

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

// Browsers time out on Cloudflare's alternate port 53. 5349 is a real TURNS port.
function usable(url: string): boolean {
  return !/:53(?:\?|$)/.test(url)
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

  const keyId = Deno.env.get('CF_TURN_KEY_ID') ?? ''
  const token = Deno.env.get('CF_TURN_API_TOKEN') ?? ''
  if (!keyId || !token) return json({ error: 'TURN relay is not configured.' }, 503)

  const response = await fetch(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl: TTL_SECONDS }),
    },
  )
  if (!response.ok) return json({ error: 'Could not get a voice relay.' }, 502)

  const body = (await response.json()) as { iceServers?: { urls?: string | string[] }[] }
  const iceServers = (body.iceServers ?? [])
    .map((server) => {
      const urls = (Array.isArray(server.urls) ? server.urls : server.urls ? [server.urls] : []).filter(usable)
      return { ...server, urls }
    })
    .filter((server) => server.urls.length > 0)

  return json({ iceServers })
})
