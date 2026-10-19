// Google STUN discovers a public address. TURN relays audio when NAT blocks a direct path.
// Defaults use Metered Open Relay's published static secret. Override with VITE_TURN_*.

export const DEFAULT_TURN_SECRET = 'openrelayprojectsecret'

export const DEFAULT_TURN_URLS = [
  'turns:staticauth.openrelay.metered.ca:443?transport=tcp',
  'turn:staticauth.openrelay.metered.ca:443?transport=tcp',
  'turn:staticauth.openrelay.metered.ca:80?transport=tcp',
  'turn:staticauth.openrelay.metered.ca:80',
]

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

export async function buildIceServers(env: TurnEnv = {}): Promise<RTCIceServer[]> {
  const servers = googleStunServers()
  const raw = (env.urls ?? '').trim()
  if (raw.toLowerCase() === 'none') return servers

  const urls = raw
    ? raw
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : DEFAULT_TURN_URLS
  const username = (env.username ?? '').trim()
  const credential = (env.credential ?? '').trim()
  const auth =
    username && credential
      ? { username, credential }
      : await turnRestCredential((env.secret ?? '').trim() || DEFAULT_TURN_SECRET)
  servers.push({ urls, ...auth })
  return servers
}

export function turnEnvFromImport(): TurnEnv {
  return {
    urls: import.meta.env.VITE_TURN_URLS,
    username: import.meta.env.VITE_TURN_USERNAME,
    credential: import.meta.env.VITE_TURN_CREDENTIAL,
    secret: import.meta.env.VITE_TURN_SECRET,
  }
}

export async function createPeerConnection(): Promise<RTCPeerConnection> {
  return new RTCPeerConnection({ iceServers: await buildIceServers(turnEnvFromImport()) })
}

const NETWORK_FAILURE = 'The call could not connect. A firewall or mobile network may be blocking the voice path.'

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
  return NETWORK_FAILURE
}
