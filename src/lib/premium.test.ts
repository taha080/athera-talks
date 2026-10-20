import { describe, expect, it } from 'vitest'
import { avatarAnimates, hasPremium, isPremiumUntil, isPremiumWindow } from './premium'

describe('premium', () => {
  const now = Date.parse('2026-10-20T12:00:00Z')

  it('is active only inside the premium window', () => {
    expect(isPremiumUntil(null, now)).toBe(false)
    expect(isPremiumUntil('2026-10-20T11:59:00Z', now)).toBe(false)
    expect(isPremiumUntil('2026-10-21T12:00:00Z', now)).toBe(true)
    expect(isPremiumWindow(null, '2026-10-23T00:00:00Z', now)).toBe(true)
    expect(isPremiumWindow('2026-10-21T00:00:00Z', '2026-10-23T00:00:00Z', now)).toBe(false)
    expect(isPremiumWindow('2026-10-19T00:00:00Z', '2026-10-23T00:00:00Z', now)).toBe(true)
    expect(hasPremium({ premiumUntil: '2026-10-19T00:00:00Z', isPremium: true }, now)).toBe(false)
    expect(hasPremium({ premiumFrom: '2026-10-22T00:00:00Z', premiumUntil: '2026-10-23T00:00:00Z' }, now)).toBe(false)
    expect(hasPremium({ isPremium: true }, now)).toBe(true)
  })

  it('stops a GIF after premium expires unless the account is the creator', () => {
    expect(avatarAnimates('https://cdn.example/a.gif', false, false)).toBe(false)
    expect(avatarAnimates('https://cdn.example/a.gif?v=1', false, true)).toBe(true)
    expect(avatarAnimates('https://cdn.example/a.gif', true, false)).toBe(true)
    expect(avatarAnimates('https://cdn.example/a.jpg', false, false)).toBe(true)
  })
})