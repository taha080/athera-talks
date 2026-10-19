import { THEMES, type ThemeName } from './theme'

export const WALLPAPERS = [
  'plain',
  'ink',
  'paper',
  'accent',
  'waves',
  'hemp',
  'diamonds',
  'stripes',
  'dots',
  'petals',
  'mist',
  'grid',
  'stars',
  'leaves',
  'custom',
] as const

export type WallpaperName = (typeof WALLPAPERS)[number]

export const THEME_CHOICES: { id: ThemeName; label: string; swatch: string }[] = [
  { id: 'dark', label: 'Dark', swatch: '#09080f' },
  { id: 'naruto', label: 'Naruto', swatch: '#ff8a1a' },
  { id: 'midnight', label: 'Midnight Blue', swatch: '#7aa2ff' },
  { id: 'sakura', label: 'Sakura', swatch: '#ff7aa2' },
  { id: 'ocean', label: 'Ocean', swatch: '#2ec4b6' },
  { id: 'forest', label: 'Forest', swatch: '#7dce82' },
  { id: 'light', label: 'Light', swatch: '#f6f3ee' },
  { id: 'amoled', label: 'AMOLED', swatch: '#000000' },
]

export const WALLPAPER_CHOICES: { id: WallpaperName; label: string }[] = [
  { id: 'plain', label: 'Plain' },
  { id: 'ink', label: 'Ink' },
  { id: 'paper', label: 'Paper' },
  { id: 'accent', label: 'Accent' },
  { id: 'waves', label: 'Waves' },
  { id: 'hemp', label: 'Hemp' },
  { id: 'diamonds', label: 'Diamonds' },
  { id: 'stripes', label: 'Stripes' },
  { id: 'dots', label: 'Dots' },
  { id: 'petals', label: 'Petals' },
  { id: 'mist', label: 'Mist' },
  { id: 'grid', label: 'Grid' },
  { id: 'stars', label: 'Stars' },
  { id: 'leaves', label: 'Leaves' },
]

export function parseWallpaper(value: string | null | undefined): WallpaperName {
  return WALLPAPERS.includes(value as WallpaperName) ? (value as WallpaperName) : 'plain'
}

export function wallpaperClass(wallpaper: string): string {
  const name = parseWallpaper(wallpaper)
  return name === 'custom' ? 'chat-wallpaper wallpaper-custom' : `chat-wallpaper wallpaper-${name}`
}

export const themeIds = THEMES
