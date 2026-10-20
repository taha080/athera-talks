import { describe, expect, it } from 'vitest'
import { shouldAnnounceTyping } from './typing'

describe('shouldAnnounceTyping', () => {
  it('stays quiet for empty text and repeats inside the throttle', () => {
    expect(shouldAnnounceTyping('', 0, 5_000)).toBe(false)
    expect(shouldAnnounceTyping('   ', 0, 5_000)).toBe(false)
    expect(shouldAnnounceTyping('hi', 1_000, 2_000)).toBe(false)
    expect(shouldAnnounceTyping('hi', 1_000, 2_600)).toBe(true)
  })
})