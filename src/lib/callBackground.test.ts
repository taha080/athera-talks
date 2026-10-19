import { describe, expect, it } from 'vitest'
import {
  BACKGROUND_RECONNECT_DELAY_MS,
  CALL_LIFECYCLE_EVENTS,
  MAX_BACKGROUND_RECONNECTS,
  MEDIA_SESSION_TITLE,
  RETURN_BANNER,
  bindHangupAction,
  callInProgress,
  canAttemptRecover,
  describeCallMediaSession,
  pageEventChangesCall,
  peerLinkDropped,
  shouldAcceptRestartOffer,
  shouldConfirmPageLeave,
  shouldReconnectInBackground,
  shouldReconnectOnReturn,
  shouldRequestWakeLock,
} from './callBackground'

const caller = {
  phase: 'connected' as const,
  role: 'caller' as const,
  live: true,
  recovering: false,
  link: { ice: 'disconnected', connection: 'disconnected' },
}

describe('page lifecycle', () => {
  it('does not end or mute a call on visibilitychange, pagehide, or blur', () => {
    expect(CALL_LIFECYCLE_EVENTS).toEqual(['visibilitychange', 'pagehide', 'blur'])
    for (const event of CALL_LIFECYCLE_EVENTS) {
      expect(pageEventChangesCall(event)).toEqual({ end: false, mute: false })
    }
  })

  it('asks the browser to confirm leaving only while a call is up', () => {
    expect(shouldConfirmPageLeave('connected')).toBe(true)
    expect(shouldConfirmPageLeave('incoming')).toBe(true)
    expect(shouldConfirmPageLeave('connecting')).toBe(true)
    expect(shouldConfirmPageLeave('idle')).toBe(false)
    expect(shouldConfirmPageLeave('failed')).toBe(false)
    expect(callInProgress('ringing')).toBe(true)
  })
})

describe('background reconnect', () => {
  it('restarts a dropped caller link while hidden and again when the page returns', () => {
    expect(shouldReconnectInBackground({ ...caller, hidden: true })).toBe(true)
    expect(shouldReconnectOnReturn(caller)).toBe(true)
    expect(peerLinkDropped({ ice: 'failed', connection: 'connected' })).toBe(true)
    expect(BACKGROUND_RECONNECT_DELAY_MS).toBeGreaterThan(0)
    expect(canAttemptRecover(MAX_BACKGROUND_RECONNECTS - 1)).toBe(true)
    expect(canAttemptRecover(MAX_BACKGROUND_RECONNECTS)).toBe(false)
  })

  it('leaves a healthy or visible call on its current peer connection', () => {
    expect(shouldReconnectInBackground({ ...caller, hidden: false })).toBe(false)
    expect(shouldReconnectInBackground({ ...caller, hidden: true, role: 'callee' })).toBe(true)
    expect(shouldReconnectInBackground({ ...caller, hidden: true, role: null })).toBe(false)
    expect(shouldReconnectInBackground({ ...caller, hidden: true, live: false })).toBe(false)
    expect(shouldReconnectInBackground({ ...caller, hidden: true, recovering: true })).toBe(false)
    expect(
      shouldReconnectInBackground({
        ...caller,
        hidden: true,
        link: { ice: 'connected', connection: 'connected' },
      }),
    ).toBe(false)
    expect(
      shouldReconnectInBackground({
        ...caller,
        hidden: true,
        link: { ice: 'checking', connection: 'connecting' },
      }),
    ).toBe(false)
    expect(shouldReconnectOnReturn({ ...caller, link: { ice: 'completed', connection: 'connected' } })).toBe(false)
    expect(shouldReconnectOnReturn({ ...caller, phase: 'incoming', link: null })).toBe(false)
    expect(shouldReconnectOnReturn({ ...caller, link: null })).toBe(true)
    expect(shouldAcceptRestartOffer('a', 'b', 'have-local-offer')).toBe(false)
    expect(shouldAcceptRestartOffer('b', 'a', 'have-local-offer')).toBe(true)
    expect(shouldAcceptRestartOffer('a', 'b', 'stable')).toBe(true)
  })
})

describe('call keepalive surfaces', () => {
  it('names the media session and the return banner', () => {
    expect(MEDIA_SESSION_TITLE).toBe('Athera Talks call')
    expect(RETURN_BANNER).toBe('Call in progress, tap to return')
    expect(describeCallMediaSession(true)).toEqual({ title: 'Athera Talks call', playbackState: 'playing' })
    expect(describeCallMediaSession(false)).toBeNull()
  })

  it('requests a screen wake lock only while a call is visible', () => {
    expect(shouldRequestWakeLock(true, true, true)).toBe(true)
    expect(shouldRequestWakeLock(true, false, true)).toBe(false)
    expect(shouldRequestWakeLock(false, true, true)).toBe(false)
    expect(shouldRequestWakeLock(true, true, false)).toBe(false)
  })

  it('binds a hang-up action and ignores browsers that reject it', () => {
    let bound: (() => void) | null = () => {}
    bindHangupAction((_action, handler) => {
      bound = handler
    }, () => {})
    expect(bound).not.toBeNull()
    expect(() => bindHangupAction(() => {
      throw new Error('unsupported')
    }, () => {})).not.toThrow()
  })
})
