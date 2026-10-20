import { describe, expect, it } from 'vitest'
import { callLogLabel, endedCallStatus, formatCallDuration } from './callLog'

describe('call log label', () => {
  it('formats a completed outgoing call and a missed call', () => {
    expect(formatCallDuration(222)).toBe('3:42')
    expect(
      callLogLabel({
        callType: 'voice',
        status: 'completed',
        durationSeconds: 222,
        callerId: 'taha',
        meId: 'taha',
      }),
    ).toBe('Outgoing voice call, 3:42')
    expect(
      callLogLabel({
        callType: 'voice',
        status: 'missed',
        durationSeconds: 0,
        callerId: 'sakura',
        meId: 'taha',
      }),
    ).toBe('Missed voice call')
  })

  it('picks a status when the call ends', () => {
    expect(endedCallStatus({ answered: true, reason: 'hangup', role: 'caller' })).toBe('completed')
    expect(endedCallStatus({ answered: false, reason: 'reject', role: 'callee' })).toBe('declined')
    expect(endedCallStatus({ answered: false, reason: 'timeout', role: 'caller' })).toBe('missed')
    expect(endedCallStatus({ answered: false, reason: 'hangup', role: 'caller' })).toBe('cancelled')
  })
})