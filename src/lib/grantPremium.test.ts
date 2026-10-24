import { describe, expect, it } from 'vitest'
import { grantDaysIssue, grantPremiumUntil, normalizeGrantUsername } from './grantPremium'
import { hasPremium } from './premium'

describe('grant premium validation', () => {
  it('normalises usernames for lookup', () => {
    expect(normalizeGrantUsername('  @Sakura  ')).toBe('sakura')
    expect(normalizeGrantUsername('@@taha080')).toBe('taha080')
    expect(normalizeGrantUsername('  ')).toBe('')
  })

  it('only allows 1 to 365 days', () => {
    expect(grantDaysIssue(0)).not.toBeNull()
    expect(grantDaysIssue(-1)).not.toBeNull()
    expect(grantDaysIssue(366)).not.toBeNull()
    expect(grantDaysIssue(7.5)).not.toBeNull()
    expect(grantDaysIssue(1)).toBeNull()
    expect(grantDaysIssue(7)).toBeNull()
    expect(grantDaysIssue(30)).toBeNull()
    expect(grantDaysIssue(365)).toBeNull()
  })

  it('a 7-day grant is premium for the whole window and not after it', () => {
    const from = new Date('2026-10-24T12:00:00Z')
    const until = grantPremiumUntil(from, 7)
    expect(until.toISOString()).toBe('2026-10-31T12:00:00.000Z')
    const person = { premiumFrom: from.toISOString(), premiumUntil: until.toISOString() }
    expect(hasPremium(person, Date.parse('2026-10-24T12:00:00Z'))).toBe(true)
    expect(hasPremium(person, Date.parse('2026-10-30T12:00:00Z'))).toBe(true)
    expect(hasPremium(person, Date.parse('2026-10-31T12:00:00Z'))).toBe(false)
  })
})
