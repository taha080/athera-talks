import type { CallPhase } from './callMachine'

// Chrome keeps a background tab alive while this element is playing the remote
// call. These page events must not end the call or mute that audio.
export const CALL_LIFECYCLE_EVENTS = ['visibilitychange', 'pagehide', 'blur'] as const

export const RETURN_BANNER = 'Call in progress, tap to return'
export const MEDIA_SESSION_TITLE = 'Athera Talks call'

export const BACKGROUND_RECONNECT_DELAY_MS = 1_500
export const RECOVER_COOLDOWN_MS = 12_000
export const MAX_BACKGROUND_RECONNECTS = 4
export const OFFER_RESEND_LIMIT = 2
export const OFFER_RESEND_MS = 2_000

export type PeerLink = {
  ice: string
  connection: string
}

const DROPPED = new Set(['disconnected', 'failed', 'closed'])

export function pageEventChangesCall(eventType: string): { end: boolean; mute: boolean } {
  if ((CALL_LIFECYCLE_EVENTS as readonly string[]).includes(eventType)) {
    return { end: false, mute: false }
  }
  return { end: false, mute: false }
}

export function callInProgress(phase: CallPhase): boolean {
  return phase === 'incoming' || phase === 'outgoing' || phase === 'ringing' || phase === 'connecting' || phase === 'connected'
}

export function reconnectablePhase(phase: CallPhase): boolean {
  return phase === 'outgoing' || phase === 'ringing' || phase === 'connecting' || phase === 'connected'
}

export function shouldConfirmPageLeave(phase: CallPhase): boolean {
  return callInProgress(phase)
}

export function peerLinkDropped(link: PeerLink): boolean {
  return DROPPED.has(link.ice) || DROPPED.has(link.connection)
}

export function canAttemptRecover(attempts: number, max = MAX_BACKGROUND_RECONNECTS): boolean {
  return attempts < max
}

type ReconnectInput = {
  phase: CallPhase
  role: 'caller' | 'callee' | null
  link: PeerLink | null
  live: boolean
  recovering: boolean
}

function sideCanReconnect(input: ReconnectInput): boolean {
  return input.live && !input.recovering && (input.role === 'caller' || input.role === 'callee') && reconnectablePhase(input.phase)
}

// Either side may send a fresh relay offer. The call screen breaks glare by
// letting the higher user id accept the other side's offer.
export function shouldReconnectInBackground(input: ReconnectInput & { hidden: boolean }): boolean {
  if (!input.hidden || !sideCanReconnect(input) || !input.link) return false
  return peerLinkDropped(input.link)
}

export function shouldReconnectOnReturn(input: ReconnectInput): boolean {
  if (!sideCanReconnect(input)) return false
  if (!input.link) return input.phase === 'connected' || input.phase === 'connecting'
  return peerLinkDropped(input.link)
}

export function shouldAcceptRestartOffer(myId: string, theirId: string, signalingState: string): boolean {
  const impolite = myId < theirId
  return !(impolite && signalingState === 'have-local-offer')
}

export function shouldRequestWakeLock(supported: boolean, visible: boolean, callActive: boolean): boolean {
  return supported && visible && callActive
}

export function describeCallMediaSession(active: boolean): { title: string; playbackState: 'playing' } | null {
  if (!active) return null
  return { title: MEDIA_SESSION_TITLE, playbackState: 'playing' }
}

export function bindHangupAction(
  setActionHandler: (action: string, handler: (() => void) | null) => void,
  onHangup: (() => void) | null,
): void {
  try {
    setActionHandler('hangup', onHangup)
  } catch {
    // Browsers without the call action reject it; the call itself keeps going.
  }
}
