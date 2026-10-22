import { describe, expect, it } from 'vitest'
import { FORGER_CHAT_ID, conversationUsesForgerBubbles, conversationWallpaperClass, conversationWallpaperMedia } from './conversationWallpaper'

describe('conversation wallpaper', () => {
  it('applies the forger wallpaper only to the Taha and Elma conversation', () => {
    expect(conversationWallpaperClass(FORGER_CHAT_ID)).toBe('chat-wallpaper wallpaper-forger')
    expect(conversationWallpaperClass('c1000000-0000-4000-8000-000000000001')).toBe('')
    expect(conversationWallpaperClass('elma')).toBe('')
    expect(conversationWallpaperClass(null)).toBe('')
    expect(conversationWallpaperMedia(FORGER_CHAT_ID)?.gif).toMatch(/taha-elma/)
    expect(conversationWallpaperMedia('c1000000-0000-4000-8000-000000000001')).toBeNull()
  })

  it('uses the rose bubble only in the Taha and Elma conversation', () => {
    expect(conversationUsesForgerBubbles(FORGER_CHAT_ID)).toBe(true)
    expect(conversationUsesForgerBubbles('c1000000-0000-4000-8000-000000000001')).toBe(false)
    expect(conversationUsesForgerBubbles('elma')).toBe(false)
    expect(conversationUsesForgerBubbles(null)).toBe(false)
  })
})
