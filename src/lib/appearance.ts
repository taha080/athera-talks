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
  'blush',
  'lavender',
  'peach',
  'rosegold',
  'cotton',
  'mint',
  'blossom',
  'coquette',
  'custom',
] as const

export type WallpaperName = (typeof WALLPAPERS)[number]

export type ThemeChoice = { id: ThemeName; label: string; swatch: string }

export const THEME_GROUPS: { id: string; label: string; themes: ThemeChoice[] }[] = [
  {
    id: 'classic',
    label: 'Classic',
    themes: [
      { id: 'light', label: 'Light', swatch: '#1a56db' },
      { id: 'dark', label: 'Dark', swatch: '#141a22' },
      { id: 'midnight', label: 'Midnight Blue', swatch: '#7aa2ff' },
      { id: 'ocean', label: 'Ocean', swatch: '#2ec4b6' },
      { id: 'forest', label: 'Forest', swatch: '#7dce82' },
      { id: 'amoled', label: 'AMOLED', swatch: '#000000' },
    ],
  },
  {
    id: 'anime',
    label: 'Anime',
    themes: [
      { id: 'naruto', label: 'Naruto', swatch: '#ff8a1a' },
      { id: 'sakura', label: 'Sakura', swatch: '#ff7aa2' },
    ],
  },
  {
    id: 'soft',
    label: 'Soft & Pretty',
    themes: [
      { id: 'blush', label: 'Blush Pink', swatch: '#a32055' },
      { id: 'lavender', label: 'Lavender Dream', swatch: '#5c3d8f' },
      { id: 'peach', label: 'Peach Sorbet', swatch: '#b84e2a' },
      { id: 'rosegold', label: 'Rose Gold', swatch: '#8e4a3c' },
      { id: 'cotton', label: 'Cotton Candy', swatch: '#b42364' },
      { id: 'mint', label: 'Mint Cream', swatch: '#1a6b4e' },
      { id: 'blossom', label: 'Cherry Blossom', swatch: '#a3204c' },
      { id: 'coquette', label: 'Coquette', swatch: '#9e3450' },
    ],
  },
]

export const THEME_CHOICES: ThemeChoice[] = THEME_GROUPS.flatMap((group) => group.themes)

const PAIRED_WALLPAPER: Partial<Record<ThemeName, WallpaperName>> = {
  blush: 'blush',
  lavender: 'lavender',
  peach: 'peach',
  rosegold: 'rosegold',
  cotton: 'cotton',
  mint: 'mint',
  blossom: 'blossom',
  coquette: 'coquette',
}

export function pairedWallpaper(theme: ThemeName): WallpaperName | null {
  return PAIRED_WALLPAPER[theme] ?? null
}

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
  { id: 'blush', label: 'Blush' },
  { id: 'lavender', label: 'Lavender' },
  { id: 'peach', label: 'Peach' },
  { id: 'rosegold', label: 'Rose Gold' },
  { id: 'cotton', label: 'Cotton Candy' },
  { id: 'mint', label: 'Mint' },
  { id: 'blossom', label: 'Blossom' },
  { id: 'coquette', label: 'Coquette' },
]

export function parseWallpaper(value: string | null | undefined): WallpaperName {
  return WALLPAPERS.includes(value as WallpaperName) ? (value as WallpaperName) : 'plain'
}

export function wallpaperClass(wallpaper: string): string {
  const name = parseWallpaper(wallpaper)
  return name === 'custom' ? 'chat-wallpaper wallpaper-custom' : `chat-wallpaper wallpaper-${name}`
}

export const themeIds = THEMES
