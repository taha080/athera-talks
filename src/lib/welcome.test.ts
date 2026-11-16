import { describe, expect, it } from 'vitest'
import {
  markWelcomeShown,
  shouldShowWelcome,
  WELCOME_SEEN_KEY,
  welcomeProgress,
  welcomeTitleVisible,
} from './welcome'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  }
}

describe('welcome splash', () => {
  it('shows on a fresh open', () => {
    expect(shouldShowWelcome(memoryStorage(), false)).toBe(true)
  })

  it('does not show again in the same tab session', () => {
    const storage = memoryStorage()
    markWelcomeShown(storage)
    expect(storage.values.get(WELCOME_SEEN_KEY)).toBe('1')
    expect(shouldShowWelcome(storage, false)).toBe(false)
  })

  it('never shows when reduced motion is preferred', () => {
    expect(shouldShowWelcome(memoryStorage(), true)).toBe(false)
  })

  it('never shows without storage', () => {
    expect(shouldShowWelcome(null, false)).toBe(false)
    expect(shouldShowWelcome(undefined, false)).toBe(false)
  })

  it('never shows when storage throws, and marking never throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(shouldShowWelcome(broken, false)).toBe(false)
    expect(() => markWelcomeShown(broken)).not.toThrow()
  })

  it('tracks video progress as a 0..1 fraction', () => {
    expect(welcomeProgress(0, 4.04)).toBe(0)
    expect(welcomeProgress(2.02, 4.04)).toBeCloseTo(0.5)
    expect(welcomeProgress(4.04, 4.04)).toBe(1)
    expect(welcomeProgress(5, 4.04)).toBe(1)
    expect(welcomeProgress(-1, 4.04)).toBe(0)
  })

  it('returns 0 progress without a usable duration', () => {
    expect(welcomeProgress(1, 0)).toBe(0)
    expect(welcomeProgress(1, Number.NaN)).toBe(0)
    expect(welcomeProgress(Number.NaN, 4.04)).toBe(0)
  })

  it('shows the title only in the last second of the video', () => {
    expect(welcomeTitleVisible(2.5, 4.04)).toBe(false)
    expect(welcomeTitleVisible(3.04, 4.04)).toBe(true)
    expect(welcomeTitleVisible(4.04, 4.04)).toBe(true)
  })

  it('never shows the title without a usable duration', () => {
    expect(welcomeTitleVisible(3.5, 0)).toBe(false)
    expect(welcomeTitleVisible(3.5, Number.NaN)).toBe(false)
  })
})
