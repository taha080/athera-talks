import { describe, expect, it } from 'vitest'
import { FORGER_CHAT_ID, conversationWallpaperClass, conversationWallpaperMedia } from './conversationWallpaper'

describe('conversation wallpaper', () => {
  it('applies the forger wallpaper only to the Taha and Elma conversation', () => {
    expect(conversationWallpaperClass(FORGER_CHAT_ID)).toBe('chat-wallpaper wallpaper-forger')
    expect(conversationWallpaperClass('c1000000-0000-4000-8000-000000000001')).toBe('')
    expect(conversationWallpaperClass('elma')).toBe('')
    expect(conversationWallpaperClass(null)).toBe('')
    expect(conversationWallpaperMedia(FORGER_CHAT_ID)?.gif).toMatch(/taha-elma/)
    expect(conversationWallpaperMedia('c1000000-0000-4000-8000-000000000001')).toBeNull()
  })
})
