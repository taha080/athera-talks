import { describe, expect, it } from 'vitest'
import { rememberCandidate, takeCandidates } from './iceQueue'

const early = { candidate: 'early', sdpMid: '0' }
const later = { candidate: 'later', sdpMid: '0' }

describe('ice candidate queue', () => {
  it('keeps candidates that arrive before a call is active, then flushes them in order', () => {
    let queue = rememberCandidate(new Map(), 'c1', early, null)
    queue = rememberCandidate(queue, 'c1', later, null)
    const taken = takeCandidates(queue, 'c1')
    expect(taken.candidates).toEqual([early, later])
    expect(taken.queue.size).toBe(0)
  })

  it('drops candidates for a different conversation once a call is active', () => {
    const queue = rememberCandidate(new Map(), 'other', early, 'c1')
    expect(queue.size).toBe(0)
  })
})
