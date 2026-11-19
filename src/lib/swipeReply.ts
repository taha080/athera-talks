/**
 * Swipe-to-reply gesture, WhatsApp/Instagram style: drag a message bubble
 * to the right and it follows the finger; past the trigger it replies.
 *
 * A vertical scroll must never trigger it, so a swipe only counts when the
 * drag is mostly horizontal (vertical movement stays small) and travels
 * far enough to the right.
 */

/** Finger travel to the right that triggers a reply. */
export const SWIPE_REPLY_TRIGGER = 60

/** Largest visual slide of the bubble while the finger is dragging. */
export const SWIPE_REPLY_MAX = 56

/** Vertical travel allowed while a right swipe is still a swipe, not a scroll. */
export const SWIPE_REPLY_MAX_DY = 50

/** True when a pointer drag (dx right, dy down) is a deliberate reply swipe. */
export function isSwipeToReply(dx: number, dy: number): boolean {
  return dx >= SWIPE_REPLY_TRIGGER && Math.abs(dy) < SWIPE_REPLY_MAX_DY
}

/**
 * Live drag offset for the bubble while swiping: follows a mostly-horizontal
 * right drag, capped at SWIPE_REPLY_MAX. Anything else (left, vertical,
 * diagonal) returns 0 so the bubble never moves the wrong way.
 */
export function swipeReplyOffset(dx: number, dy: number): number {
  if (dx <= 0 || Math.abs(dy) > Math.abs(dx)) return 0
  return Math.min(dx, SWIPE_REPLY_MAX)
}
