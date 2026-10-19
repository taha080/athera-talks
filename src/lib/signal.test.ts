import { describe, expect, it } from 'vitest'
import { isCallSignal, signalChannelIsHealthy, signalSubscribeFailed } from './signal'

describe('isCallSignal', () => {
  it('accepts a ring and rejects junk', () => {
    expect(
      isCallSignal({
        kind: 'ring',
        conversationId: 'c1',
        from: { id: 'a', username: 'sakura', avatarUrl: null, favouriteAnime: null },
      }),
    ).toBe(true)
    expect(isCallSignal({ kind: 'poke', conversationId: 'c1' })).toBe(false)
    expect(isCallSignal(null)).toBe(false)
  })
})

describe('signal channel keepalive', () => {
  it('resubscribes after the realtime channel drops and leaves a joined channel alone', () => {
    expect(signalSubscribeFailed('CHANNEL_ERROR')).toBe(true)
    expect(signalSubscribeFailed('TIMED_OUT')).toBe(true)
    expect(signalSubscribeFailed('CLOSED')).toBe(true)
    expect(signalSubscribeFailed('SUBSCRIBED')).toBe(false)
    expect(signalChannelIsHealthy('joined')).toBe(true)
    expect(signalChannelIsHealthy('joining')).toBe(true)
    expect(signalChannelIsHealthy('closed')).toBe(false)
    expect(signalChannelIsHealthy('errored')).toBe(false)
    expect(signalChannelIsHealthy(undefined)).toBe(false)
  })
})
