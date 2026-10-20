import { describe, expect, it } from 'vitest'
import { accountTheme, parseTheme, readStoredTheme, THEME_KEY } from './theme'

describe('parseTheme', () => {
  it('defaults to Midnight and still accepts the other themes', () => {
    expect(parseTheme(null)).toBe('midnight')
    expect(parseTheme('nope')).toBe('midnight')
    expect(parseTheme('dark')).toBe('dark')
    expect(parseTheme('light')).toBe('light')
    expect(parseTheme('naruto')).toBe('naruto')
    expect(parseTheme('amoled')).toBe('amoled')
    expect(parseTheme('coquette')).toBe('coquette')
    expect(parseTheme('blossom')).toBe('blossom')
  })
})

describe('accountTheme', () => {
  it('lets the saved account theme replace a stale local theme', () => {
    expect(accountTheme('midnight')).toBe('midnight')
    expect(accountTheme('naruto')).toBe('naruto')
    expect(accountTheme('mint')).toBe('mint')
    expect(accountTheme(null)).toBe('midnight')
    expect(accountTheme(undefined)).toBe('midnight')
  })
})

describe('readStoredTheme', () => {
  it('reads the saved choice', () => {
    const storage = {
      getItem: (key: string) => (key === THEME_KEY ? 'naruto' : null),
    }
    expect(readStoredTheme(storage)).toBe('naruto')
    expect(readStoredTheme(null)).toBe('midnight')
  })
})
