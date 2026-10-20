import { describe, expect, it } from 'vitest'
import { canViewSharedProfile, visibleLastSeen } from './profileAccess'

const me = 'me'
const sakura = 'sakura'
const stranger = 'stranger'

describe('canViewSharedProfile', () => {
  it('allows a direct-chat peer and a shared group member', () => {
    expect(canViewSharedProfile({ personId: sakura, meId: me, directPeerIds: [sakura], groupMemberIds: [] })).toBe(true)
    expect(canViewSharedProfile({ personId: sakura, meId: me, directPeerIds: [], groupMemberIds: [sakura, 'kenji'] })).toBe(true)
  })

  it('refuses yourself and anyone you do not share a chat with', () => {
    expect(canViewSharedProfile({ personId: me, meId: me, directPeerIds: [sakura], groupMemberIds: [me] })).toBe(false)
    expect(canViewSharedProfile({ personId: stranger, meId: me, directPeerIds: [sakura], groupMemberIds: ['kenji'] })).toBe(false)
    expect(canViewSharedProfile({ personId: sakura, meId: '', directPeerIds: [sakura], groupMemberIds: [] })).toBe(false)
  })
})

describe('visibleLastSeen', () => {
  const seen = '2026-10-20T12:00:00.000Z'

  it('hides last seen when that person turned it off, and still shows it to the creator', () => {
    expect(visibleLastSeen(seen, false, false)).toBeNull()
    expect(visibleLastSeen(seen, false, true)).toBe(seen)
    expect(visibleLastSeen(seen, true, false)).toBe(seen)
    expect(visibleLastSeen(undefined, true, false)).toBeNull()
  })
})
