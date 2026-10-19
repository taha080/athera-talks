import type { Profile } from '../types'

export type CallPhase = 'idle' | 'outgoing' | 'ringing' | 'incoming' | 'connecting' | 'connected' | 'failed'

export type CallState = {
  phase: CallPhase
  conversationId: string | null
  peer: Profile | null
  muted: boolean
  startedAt: number | null
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
  startedAt: null,
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
      if (state.phase !== 'outgoing' && state.phase !== 'ringing' && state.phase !== 'connecting') return state
      return {
        ...state,
        phase: 'connected',
        startedAt: state.startedAt ?? action.at,
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
