export const THEME_KEY = 'tatalk:theme'

export type ThemeName = 'dark' | 'naruto'

export function parseTheme(value: string | null | undefined): ThemeName {
  return value === 'naruto' ? 'naruto' : 'dark'
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
  meta?.setAttribute('content', theme === 'naruto' ? '#120d09' : '#09080f')
}
