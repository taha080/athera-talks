import { describe, expect, it } from 'vitest'
import { callTabTitle, hiddenCallTitle, mediaSessionCopy, shouldResumeCallAudio } from './callPresence'

describe('call presence', () => {
  it('formats the hidden tab title from the elapsed clock', () => {
    expect(callTabTitle('01:23')).toBe('● 01:23 · Athera Talks')
    expect(hiddenCallTitle('connected', 1_000, 84_000)).toBe('● 01:23 · Athera Talks')
    expect(hiddenCallTitle('connected', 1_000, 3_602_000)).toBe('● 1:00:01 · Athera Talks')
    expect(hiddenCallTitle('outgoing', null, 5_000)).toBe('● Calling… · Athera Talks')
    expect(hiddenCallTitle('idle', null, 5_000)).toBeNull()
  })

  it('keeps a connected call in the media session as playing', () => {
    expect(mediaSessionCopy('connected', 'ada', 1_000, 84_000)).toEqual({
      title: '01:23 · @ada',
      artist: 'Athera Talks',
      playbackState: 'playing',
    })
    expect(mediaSessionCopy('ringing', 'ada', null, 5_000)).toEqual({
      title: 'Call with @ada',
      artist: 'Athera Talks',
      playbackState: 'playing',
    })
    expect(mediaSessionCopy('idle', 'ada', null, 5_000)).toBeNull()
    expect(mediaSessionCopy('failed', 'ada', null, 5_000)).toBeNull()
  })

  it('resumes paused call audio and leaves a muted speaker alone', () => {
    expect(shouldResumeCallAudio('connected', { paused: true, hasSource: true })).toBe(true)
    expect(shouldResumeCallAudio('connected', { paused: false, hasSource: true })).toBe(false)
    expect(shouldResumeCallAudio('connected', { paused: true, hasSource: false })).toBe(false)
    expect(shouldResumeCallAudio('idle', { paused: true, hasSource: true })).toBe(false)
  })
})
