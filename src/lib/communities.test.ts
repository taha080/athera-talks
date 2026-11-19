import { describe, expect, it } from 'vitest'
import {
  canActOnMember,
  communityNameIssue,
  containsFilteredWord,
  inviteCodeFor,
  isCommunityManager,
  parseVoiceSignalPayload,
  pollTotalVotes,
  slowModeBlocked,
  upcomingEvents,
  type CommunityEvent,
  type CommunityMember,
} from './communities'

function member(role: CommunityMember['role'], userId = 'u2'): CommunityMember {
  return {
    id: `m-${userId}`,
    userId,
    username: 'ren',
    avatarUrl: null,
    favouriteAnime: null,
    role,
    mutedUntil: null,
    joinedAt: '2026-10-24T00:00:00.000Z',
  }
}

describe('communities', () => {
  it('only owners and admins manage', () => {
    expect(isCommunityManager('owner')).toBe(true)
    expect(isCommunityManager('admin')).toBe(true)
    expect(isCommunityManager('member')).toBe(false)
    expect(isCommunityManager('pending')).toBe(false)
    expect(isCommunityManager(null)).toBe(false)
  })

  it('managers cannot act on the owner or themselves', () => {
    expect(canActOnMember('owner', member('admin'), 'u1')).toBe(true)
    expect(canActOnMember('owner', member('owner'), 'u1')).toBe(false)
    expect(canActOnMember('admin', member('admin', 'u3'), 'u1')).toBe(false)
    expect(canActOnMember('admin', member('member', 'u1'), 'u1')).toBe(false)
    expect(canActOnMember('member', member('member'), 'u1')).toBe(false)
  })

  it('validates community names', () => {
    expect(communityNameIssue('')).not.toBeNull()
    expect(communityNameIssue('A')).not.toBeNull()
    expect(communityNameIssue('Anime Nights')).toBeNull()
  })

  it('generates stable invite codes', () => {
    expect(inviteCodeFor('abc-123')).toBe(inviteCodeFor('abc-123'))
    expect(inviteCodeFor('abc-123')).toMatch(/^ATH-[A-Z0-9]{6}$/)
  })

  it('blocks filtered words and enforces slow mode', () => {
    expect(containsFilteredWord('hello spam world', ['spam'])).toBe('spam')
    expect(containsFilteredWord('hello world', ['spam'])).toBeNull()
    expect(slowModeBlocked(new Date(Date.now() - 1000).toISOString(), 30)).toBe(true)
    expect(slowModeBlocked(new Date(Date.now() - 61000).toISOString(), 30)).toBe(false)
    expect(slowModeBlocked(null, 30)).toBe(false)
  })

  it('counts poll votes and orders upcoming events', () => {
    expect(pollTotalVotes([{ text: 'A', votes: ['u1', 'u2'] }, { text: 'B', votes: [] }])).toBe(2)
    const past: CommunityEvent = {
      id: 'past', communityId: 'c1', title: 'Past', description: '', startsAt: '2020-01-01T00:00:00.000Z', createdBy: 'u1', rsvps: [],
    }
    const next: CommunityEvent = {
      id: 'next', communityId: 'c1', title: 'Next', description: '', startsAt: '2030-01-01T00:00:00.000Z', createdBy: 'u1', rsvps: [],
    }
    expect(upcomingEvents([past, next], new Date('2026-01-01T00:00:00.000Z'))).toEqual([next])
  })
})

describe('parseVoiceSignalPayload', () => {
  const peer = 'b2000000-0000-4000-8000-000000000001'
  const me = 'b2000000-0000-4000-8000-000000000002'

  it('accepts well-formed join, offer, answer, ice, and leave signals', () => {
    expect(parseVoiceSignalPayload({ from: peer, kind: 'join' }, me)).toEqual({ from: peer, kind: 'join' })
    expect(parseVoiceSignalPayload({ from: peer, kind: 'leave' }, me)).toEqual({ from: peer, kind: 'leave' })
    expect(parseVoiceSignalPayload({ from: peer, kind: 'offer', sdp: { type: 'offer', sdp: 'v=0' } }, me)).toEqual({
      from: peer, kind: 'offer', sdp: { type: 'offer', sdp: 'v=0' },
    })
    expect(parseVoiceSignalPayload({ from: peer, kind: 'answer', sdp: { type: 'answer', sdp: 'v=0' } }, me)).toEqual({
      from: peer, kind: 'answer', sdp: { type: 'answer', sdp: 'v=0' },
    })
    expect(parseVoiceSignalPayload({ from: peer, kind: 'ice', candidate: { candidate: 'a=candidate:1' } }, me)).toEqual({
      from: peer, kind: 'ice', candidate: { candidate: 'a=candidate:1' },
    })
  })

  it('drops spoofed, malformed, and own voice signals', () => {
    // A display name is not a sender id, and our own echo is not a peer.
    expect(parseVoiceSignalPayload({ from: 'sakura', kind: 'join' }, me)).toBeNull()
    expect(parseVoiceSignalPayload({ from: me, kind: 'join' }, me)).toBeNull()
    expect(parseVoiceSignalPayload({ from: peer, kind: 'shout' }, me)).toBeNull()
    expect(parseVoiceSignalPayload({ from: peer, kind: 'offer' }, me)).toBeNull()
    expect(parseVoiceSignalPayload({ from: peer, kind: 'offer', sdp: 'v=0' }, me)).toBeNull()
    expect(parseVoiceSignalPayload({ from: peer, kind: 'ice' }, me)).toBeNull()
    expect(parseVoiceSignalPayload({ kind: 'join' }, me)).toBeNull()
    expect(parseVoiceSignalPayload(null, me)).toBeNull()
  })
})
