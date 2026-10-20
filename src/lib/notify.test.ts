import { describe, expect, it } from 'vitest'
import { NOTICE_CHIME, playNoticeChime } from './notify'

describe('message notice chime', () => {
  it('stays short and quiet', () => {
    expect(NOTICE_CHIME.peakGain).toBeLessThanOrEqual(0.04)
    for (const note of NOTICE_CHIME.notes) {
      expect(note.gain).toBeLessThanOrEqual(NOTICE_CHIME.peakGain)
      expect(note.duration).toBeLessThanOrEqual(0.4)
    }
    const end = Math.max(...NOTICE_CHIME.notes.map((note) => note.start + note.duration))
    expect(end).toBeLessThanOrEqual(0.5)
  })

  it('does nothing noisy when the browser blocks audio', () => {
    expect(() => playNoticeChime()).not.toThrow()
  })
})