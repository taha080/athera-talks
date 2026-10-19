import { describe, expect, it } from 'vitest'
import { formatCallClock, formatDayLabel, formatDuration, formatListTime, formatMessageTime } from './format'

const now = new Date(2026, 9, 19, 15, 0, 0)

describe('formatDuration', () => {
  it('renders minutes and padded seconds', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(65)).toBe('1:05')
    expect(formatDuration(600)).toBe('10:00')
  })
})

describe('formatCallClock', () => {
  it('pads minutes and seconds, then adds hours', () => {
    expect(formatCallClock(0)).toBe('00:00')
    expect(formatCallClock(1)).toBe('00:01')
    expect(formatCallClock(65)).toBe('01:05')
    expect(formatCallClock(3599)).toBe('59:59')
    expect(formatCallClock(3600)).toBe('1:00:00')
    expect(formatCallClock(3665)).toBe('1:01:05')
  })
})

describe('message times', () => {
  it('uses a clock for today and a day label otherwise', () => {
    const today = new Date(2026, 9, 19, 14, 5).toISOString()
    const yesterday = new Date(2026, 9, 18, 9, 30).toISOString()
    expect(formatMessageTime(today, now)).toBe('2:05 PM')
    expect(formatListTime(today, now)).toBe('2:05 PM')
    expect(formatMessageTime(yesterday, now)).toBe('Yesterday 9:30 AM')
    expect(formatListTime(yesterday, now)).toBe('Yesterday')
    expect(formatDayLabel(today, now)).toBe('Today')
    expect(formatDayLabel(yesterday, now)).toBe('Yesterday')
  })
})
