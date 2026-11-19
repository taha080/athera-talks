import { describe, expect, it } from 'vitest'
import { isSwipeToReply, SWIPE_REPLY_MAX, SWIPE_REPLY_TRIGGER, swipeReplyOffset } from './swipeReply'

describe('swipe to reply', () => {
  it('triggers only on a long, mostly-horizontal swipe to the right', () => {
    expect(isSwipeToReply(SWIPE_REPLY_TRIGGER, 0)).toBe(true)
    expect(isSwipeToReply(120, 20)).toBe(true)
    // Too short, or the wrong way.
    expect(isSwipeToReply(SWIPE_REPLY_TRIGGER - 1, 0)).toBe(false)
    expect(isSwipeToReply(-80, 0)).toBe(false)
    // Too vertical: a scroll, not a swipe.
    expect(isSwipeToReply(120, 60)).toBe(false)
    expect(isSwipeToReply(120, -60)).toBe(false)
  })

  it('slides the bubble only with a mostly-horizontal right drag, capped', () => {
    expect(swipeReplyOffset(30, 5)).toBe(30)
    expect(swipeReplyOffset(200, 10)).toBe(SWIPE_REPLY_MAX)
    expect(swipeReplyOffset(-30, 0)).toBe(0)
    // Vertical and diagonal drags do not move the bubble.
    expect(swipeReplyOffset(10, 80)).toBe(0)
    expect(swipeReplyOffset(40, 45)).toBe(0)
    expect(swipeReplyOffset(0, 0)).toBe(0)
  })
})
