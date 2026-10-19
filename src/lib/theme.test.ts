import { describe, expect, it } from 'vitest'
import { parseTheme, readStoredTheme, THEME_KEY } from './theme'

describe('parseTheme', () => {
  it('defaults to the neutral light theme and accepts naruto', () => {
    expect(parseTheme(null)).toBe('light')
    expect(parseTheme('nope')).toBe('light')
    expect(parseTheme('dark')).toBe('dark')
    expect(parseTheme('light')).toBe('light')
    expect(parseTheme('naruto')).toBe('naruto')
    expect(parseTheme('amoled')).toBe('amoled')
    expect(parseTheme('coquette')).toBe('coquette')
    expect(parseTheme('blossom')).toBe('blossom')
  })
})

describe('readStoredTheme', () => {
  it('reads the saved choice', () => {
    const storage = {
      getItem: (key: string) => (key === THEME_KEY ? 'naruto' : null),
    }
    expect(readStoredTheme(storage)).toBe('naruto')
    expect(readStoredTheme(null)).toBe('light')
  })
})
