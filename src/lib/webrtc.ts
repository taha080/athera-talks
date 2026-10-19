// Each call asks the turn-credentials Edge Function for Metered iceServers.
// The Metered API key stays in the function secret METERED_API_KEY. If that
// fetch fails, the call uses the static Metered relay below. An explicit
// VITE_TURN_* override still wins. VITE_TURN_URLS=none stays on Google STUN.

import { CONNECT_TIMEOUT_MESSAGE } from './callMachine'
import { getSupabase } from './supabase'

export type TurnEnv = {
  urls?: string
  username?: string
  credential?: string
  secret?: string
}

export function googleStunServers(): RTCIceServer[] {
  return [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }]
}

export async function turnRestCredential(
  secret: string,
  now = Date.now(),
): Promise<{ username: string; credential: string }> {
  const username = `${Math.floor(now / 1000) + 12 * 60 * 60}:athera`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(username))
  const credential = btoa(String.fromCharCode(...new Uint8Array(signature)))
  return { username, credential }
}

// Some relays advertise port 53. Browsers time out on it.
export const METERED_FALLBACK_USERNAME = '8c806b1e87da68a6d13d1051'
export const METERED_FALLBACK_CREDENTIAL = 'CWOTQy7sg1frPlo+'

export const METERED_FALLBACK_URLS = [
  'stun:stun.relay.metered.ca:80',
  'turn:global.relay.metered.ca:80',
  'turn:global.relay.metered.ca:80?transport=tcp',
  'turn:global.relay.metered.ca:443',
  'turns:global.relay.metered.ca:443?transport=tcp',
] as const

export function meteredFallbackServers(): RTCIceServer[] {
  return METERED_FALLBACK_URLS.map((urls) =>
    urls.startsWith('turn')
      ? { urls, username: METERED_FALLBACK_USERNAME, credential: METERED_FALLBACK_CREDENTIAL }
      : { urls },
  )
}

export function iceServersOrFallback(fetched: RTCIceServer[] | null): RTCIceServer[] {
  return fetched?.length ? fetched : meteredFallbackServers()
}

export function usableTurnUrl(url: string): boolean {
  return !/:53(?:\?|$)/.test(url)
}

export function filterBrowserIceServers(servers: RTCIceServer[]): RTCIceServer[] {
  const next: RTCIceServer[] = []
  for (const server of servers) {
    const urls = (Array.isArray(server.urls) ? server.urls : [server.urls]).filter(
      (url): url is string => typeof url === 'string' && usableTurnUrl(url),
    )
    if (!urls.length) continue
    next.push({ ...server, urls })
  }
  return next
}

export async function buildIceServers(env: TurnEnv = {}): Promise<RTCIceServer[]> {
  const servers = googleStunServers()
  const raw = (env.urls ?? '').trim()
  if (!raw || raw.toLowerCase() === 'none') return servers

  const urls = raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item && usableTurnUrl(item))
  if (!urls.length) return servers
  const username = (env.username ?? '').trim()
  const credential = (env.credential ?? '').trim()
  const secret = (env.secret ?? '').trim()
  const auth =
    username && credential ? { username, credential } : secret ? await turnRestCredential(secret) : null
  if (!auth) return servers
  servers.push({ urls, ...auth })
  return servers
}

export async function fetchTurnIceServers(): Promise<RTCIceServer[] | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  try {
    const { data, error } = await supabase.functions.invoke('turn-credentials')
    const iceServers = data && typeof data === 'object' ? (data as { iceServers?: RTCIceServer[] }).iceServers : undefined
    if (error || !Array.isArray(iceServers)) return null
    const filtered = filterBrowserIceServers(iceServers)
    return filtered.length ? filtered : null
  } catch {
    return null
  }
}

export async function resolveIceServers(env: TurnEnv = {}): Promise<RTCIceServer[]> {
  const raw = (env.urls ?? '').trim()
  const secret = (env.secret ?? '').trim()
  const manual = Boolean(raw || ((env.username ?? '').trim() && (env.credential ?? '').trim()) || secret)
  if (manual) return buildIceServers(env)
  return iceServersOrFallback(await fetchTurnIceServers())
}

export function turnEnvFromImport(): TurnEnv {
  return {
    urls: import.meta.env.VITE_TURN_URLS,
    username: import.meta.env.VITE_TURN_USERNAME,
    credential: import.meta.env.VITE_TURN_CREDENTIAL,
    secret: import.meta.env.VITE_TURN_SECRET,
  }
}

export type IcePolicy = 'all' | 'relay'

// Same-tab overrides so a relay-only check can point at a TURN server.
const TURN_OVERRIDE_KEY = 'athera:turn'
const ICE_POLICY_KEY = 'athera:ice'

// A tiny silent clip played inside the call button's click, so later remote audio
// is allowed after the microphone prompt. display:none on the element blocks this.
export const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='

export function readTurnOverride(): TurnEnv | null {
  if (typeof sessionStorage === 'undefined') return null
  const raw = sessionStorage.getItem(TURN_OVERRIDE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as TurnEnv
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

export function readIcePolicy(): IcePolicy {
  if (typeof sessionStorage === 'undefined') return 'all'
  return sessionStorage.getItem(ICE_POLICY_KEY) === 'relay' ? 'relay' : 'all'
}

export function hasLiveAudioSender(
  senders: { track: { kind: string; readyState: string; enabled: boolean } | null }[],
): boolean {
  return senders.some(
    (sender) => sender.track?.kind === 'audio' && sender.track.readyState === 'live' && sender.track.enabled,
  )
}

export function pickRemoteStream(streams: readonly MediaStream[], track: MediaStreamTrack): MediaStream {
  const existing = streams[0]
  if (existing?.getAudioTracks().length) return existing
  return new MediaStream([track])
}

const CANDIDATE_ORDER = ['host', 'srflx', 'prflx', 'relay']

export function candidateType(candidate: string | null | undefined): string | null {
  const match = candidate?.match(/\btyp ([a-z0-9]+)/)
  return match?.[1] ?? null
}

export function formatCandidateTypes(types: Iterable<string>): string {
  const present = new Set(types)
  const listed = CANDIDATE_ORDER.filter((type) => present.has(type))
  for (const type of present) {
    if (!listed.includes(type)) listed.push(type)
  }
  return listed.length ? listed.join(', ') : 'none'
}

export function formatCallLink(
  ice: string,
  path: string,
  inbound: number,
  outbound: number,
  playback: string,
  candidates = 'none',
): string {
  return `ICE ${ice} · path ${path} · candidates ${candidates} · in ${inbound} · out ${outbound} · ${playback}`
}

export function waitForIceCandidate(pc: RTCPeerConnection, timeoutMs = 1500): Promise<void> {
  if (pc.localDescription?.sdp?.includes('a=candidate:')) return Promise.resolve()
  return new Promise((resolve) => {
    const finish = () => {
      window.clearTimeout(timer)
      pc.removeEventListener('icecandidate', onCandidate)
      resolve()
    }
    const onCandidate = () => {
      if (pc.iceGatheringState === 'complete' || pc.localDescription?.sdp?.includes('a=candidate:')) finish()
    }
    const timer = window.setTimeout(finish, timeoutMs)
    pc.addEventListener('icecandidate', onCandidate)
  })
}

export async function createPeerConnection(policy: IcePolicy = 'all'): Promise<RTCPeerConnection> {
  const iceServers = await resolveIceServers(readTurnOverride() ?? turnEnvFromImport())
  return new RTCPeerConnection({ iceServers, iceTransportPolicy: policy })
}

export function mediaError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return 'Microphone permission is blocked. Allow the mic, then try the call again.'
    }
    if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') {
      return 'No microphone was found on this device.'
    }
    if (error.name === 'NotReadableError' || error.name === 'AbortError') {
      return 'The microphone is in use by another app. Close it, then try again.'
    }
  }
  if (error instanceof Error && error.message) return error.message
  return 'Could not start the voice call.'
}

export function networkFailure(): string {
  return CONNECT_TIMEOUT_MESSAGE
}
