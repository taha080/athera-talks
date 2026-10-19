import { formatCallClock } from './format'
import type { Profile } from '../types'

export type CallPhase = 'idle' | 'outgoing' | 'ringing' | 'incoming' | 'connecting' | 'connected' | 'failed'

export type CallState = {
  phase: CallPhase
  conversationId: string | null
  peer: Profile | null
  muted: boolean
  connectedAt: number | null
  error: string | null
}

export type CallAction =
  | { type: 'start'; conversationId: string; peer: Profile }
  | { type: 'ringing' }
  | { type: 'incoming'; conversationId: string; peer: Profile }
  | { type: 'accept' }
  | { type: 'remote-joined' }
  | { type: 'connected'; at: number }
  | { type: 'reject' }
  | { type: 'hangup' }
  | { type: 'toggle-mute' }
  | { type: 'fail'; error: string }

export const initialCallState: CallState = {
  phase: 'idle',
  conversationId: null,
  peer: null,
  muted: false,
  connectedAt: null,
  error: null,
}

export function callReducer(state: CallState, action: CallAction): CallState {
  switch (action.type) {
    case 'start':
      if (state.phase !== 'idle') return state
      return {
        ...initialCallState,
        phase: 'outgoing',
        conversationId: action.conversationId,
        peer: action.peer,
      }
    case 'ringing':
      if (state.phase !== 'outgoing') return state
      return { ...state, phase: 'ringing' }
    case 'incoming':
      if (state.phase !== 'idle') return state
      return {
        ...initialCallState,
        phase: 'incoming',
        conversationId: action.conversationId,
        peer: action.peer,
      }
    case 'accept':
      if (state.phase !== 'incoming') return state
      return { ...state, phase: 'connecting', error: null }
    case 'remote-joined':
      if (state.phase !== 'outgoing' && state.phase !== 'ringing' && state.phase !== 'connecting') return state
      return { ...state, phase: 'connecting', error: null }
    case 'connected':
      if (state.phase === 'connected') return state.connectedAt ? state : { ...state, connectedAt: action.at }
      if (state.phase !== 'outgoing' && state.phase !== 'ringing' && state.phase !== 'connecting') return state
      return {
        ...state,
        phase: 'connected',
        connectedAt: state.connectedAt ?? action.at,
        error: null,
      }
    case 'toggle-mute':
      if (state.phase === 'idle' || state.phase === 'failed' || state.phase === 'incoming') return state
      return { ...state, muted: !state.muted }
    case 'fail':
      if (state.phase === 'idle' || state.phase === 'failed') return state
      return { ...state, phase: 'failed', error: action.error }
    case 'reject':
    case 'hangup':
      return initialCallState
    default:
      return state
  }
}

export const CONNECT_TIMEOUT_MS = 25_000
export const RELAY_RETRY_MS = 8_000
export const RELAY_RETRY_STATUS = "Couldn't connect, retrying via relay…"
export const CONNECT_TIMEOUT_MESSAGE =
  "Couldn't connect. The voice relay did not come up within 25 seconds. Check the network and try again."

export function callHeadline(phase: CallPhase, connectedAt: number | null, now: number, relay = false): string {
  if (phase === 'connected' && connectedAt) {
    const elapsed = Math.max(0, Math.floor((now - connectedAt) / 1000))
    return formatCallClock(elapsed)
  }
  if (phase === 'incoming') return 'Ringing…'
  if (phase === 'outgoing' || phase === 'ringing') return 'Calling…'
  if (phase === 'connecting') return relay ? RELAY_RETRY_STATUS : 'Connecting…'
  if (phase === 'failed') return 'Call failed'
  return ''
}
