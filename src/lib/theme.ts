export const THEME_KEY = 'tatalk:theme'

export const THEMES = ['dark', 'naruto', 'midnight', 'sakura', 'ocean', 'forest', 'light', 'amoled'] as const

export type ThemeName = (typeof THEMES)[number]

const THEME_COLOR: Record<ThemeName, string> = {
  dark: '#09080f',
  naruto: '#070d18',
  midnight: '#070b16',
  sakura: '#1a0d14',
  ocean: '#04161a',
  forest: '#0c1410',
  light: '#f6f3ee',
  amoled: '#000000',
}

export function parseTheme(value: string | null | undefined): ThemeName {
  return THEMES.includes(value as ThemeName) ? (value as ThemeName) : 'dark'
}

export function readStoredTheme(storage: { getItem: (key: string) => string | null } | null): ThemeName {
  try {
    return parseTheme(storage?.getItem(THEME_KEY))
  } catch {
    return 'dark'
  }
}

export function applyTheme(theme: ThemeName): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', theme)
  const meta = document.querySelector('meta[name="theme-color"]')
  meta?.setAttribute('content', THEME_COLOR[theme])
}
