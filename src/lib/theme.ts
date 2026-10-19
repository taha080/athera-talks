export const THEME_KEY = 'tatalk:theme'

export const THEMES = [
  'dark',
  'naruto',
  'midnight',
  'sakura',
  'ocean',
  'forest',
  'light',
  'amoled',
  'blush',
  'lavender',
  'peach',
  'rosegold',
  'cotton',
  'mint',
  'blossom',
  'coquette',
] as const

export type ThemeName = (typeof THEMES)[number]

/** Signed-in default. Flat lavender from the Lavender Infinity mark. */
export const DEFAULT_THEME: ThemeName = 'light'

const THEME_COLOR: Record<ThemeName, string> = {
  dark: '#0c1016',
  naruto: '#070d18',
  midnight: '#070b16',
  sakura: '#1a0d14',
  ocean: '#04161a',
  forest: '#0c1410',
  light: '#ffffff',
  amoled: '#000000',
  blush: '#fff5f7',
  lavender: '#f7f4fc',
  peach: '#fff6f0',
  rosegold: '#fbf6f3',
  cotton: '#f8f4fb',
  mint: '#f3fbf7',
  blossom: '#fff7f8',
  coquette: '#fbf6ee',
}

export function parseTheme(value: string | null | undefined): ThemeName {
  return THEMES.includes(value as ThemeName) ? (value as ThemeName) : DEFAULT_THEME
}

export function readStoredTheme(storage: { getItem: (key: string) => string | null } | null): ThemeName {
  try {
    return parseTheme(storage?.getItem(THEME_KEY))
  } catch {
    return DEFAULT_THEME
  }
}

export function applyTheme(theme: ThemeName): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', theme)
  const meta = document.querySelector('meta[name="theme-color"]')
  meta?.setAttribute('content', THEME_COLOR[theme])
}
