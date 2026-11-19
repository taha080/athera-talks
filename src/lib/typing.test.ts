import { describe, expect, it } from 'vitest'
import { parseTypingPayload, shouldAnnounceTyping } from './typing'

const PEER_ID = 'b2000000-0000-4000-8000-000000000001'
const ME_ID = 'b2000000-0000-4000-8000-000000000002'

describe('shouldAnnounceTyping', () => {
  it('stays quiet for empty text and repeats inside the throttle', () => {
    expect(shouldAnnounceTyping('', 0, 5_000)).toBe(false)
    expect(shouldAnnounceTyping('   ', 0, 5_000)).toBe(false)
    expect(shouldAnnounceTyping('hi', 1_000, 2_000)).toBe(false)
    expect(shouldAnnounceTyping('hi', 1_000, 2_600)).toBe(true)
  })
})

describe('parseTypingPayload', () => {
  it('accepts a well-formed typing broadcast from a peer', () => {
    expect(parseTypingPayload({ userId: PEER_ID, typing: true }, ME_ID)).toEqual({ userId: PEER_ID, typing: true })
    expect(parseTypingPayload({ userId: PEER_ID }, ME_ID)).toEqual({ userId: PEER_ID, typing: true })
    expect(parseTypingPayload({ userId: PEER_ID, typing: false }, ME_ID)).toEqual({ userId: PEER_ID, typing: false })
  })

  it('drops spoofed, malformed, and own typing broadcasts', () => {
    // A display name or a made-up id is not a sender id.
    expect(parseTypingPayload({ userId: 'sakura', typing: true }, ME_ID)).toBeNull()
    expect(parseTypingPayload({ userId: 'not-a-uuid', typing: true }, ME_ID)).toBeNull()
    expect(parseTypingPayload({ userId: 42, typing: true }, ME_ID)).toBeNull()
    expect(parseTypingPayload({ typing: true }, ME_ID)).toBeNull()
    expect(parseTypingPayload(null, ME_ID)).toBeNull()
    expect(parseTypingPayload('typing', ME_ID)).toBeNull()
    // Our own broadcast echoing back is not a peer typing.
    expect(parseTypingPayload({ userId: ME_ID, typing: true }, ME_ID)).toBeNull()
  })
})