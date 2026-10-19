import { describe, expect, it } from 'vitest'
import { isCallSignal } from './signal'

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
