import { describe, expect, it } from 'vitest'
import { avatarKind, CREATOR_GIF_MESSAGE, isGifAvatar, prepareAvatar } from './avatarFile'

function file(name: string, type: string, size = 1000): File {
  return new File([new Uint8Array(size)], name, { type })
}

describe('creator gif avatars', () => {
  it('treats a gif type or a .gif name as animated', () => {
    expect(isGifAvatar(file('photo.png', 'image/gif'))).toBe(true)
    expect(isGifAvatar(file('photo.GIF', ''))).toBe(true)
    expect(isGifAvatar(file('photo.jpg', 'image/jpeg'))).toBe(false)
  })

  it('rejects a gif from anyone who is not the creator', () => {
    expect(() => avatarKind(file('dance.gif', 'image/gif'), false)).toThrow(CREATOR_GIF_MESSAGE)
    expect(() => avatarKind(file('dance.GIF', 'application/octet-stream'), false)).toThrow(CREATOR_GIF_MESSAGE)
  })

  it('keeps a creator gif as the original file', async () => {
    const gif = file('dance.gif', 'image/gif', 2400)
    expect(avatarKind(gif, true)).toBe('gif')
    const prepared = await prepareAvatar(gif, true)
    expect(prepared.extension).toBe('gif')
    expect(prepared.blob).toBe(gif)
    expect(prepared.blob.type).toBe('image/gif')
  })

  it('rejects a creator gif over 5 MB', () => {
    expect(() => avatarKind(file('big.gif', 'image/gif', 5 * 1024 * 1024 + 1), true)).toThrow(/5 MB/)
  })

  it('still accepts a normal photo for everyone else', () => {
    expect(avatarKind(file('face.png', 'image/png'), false)).toBe('still')
    expect(avatarKind(file('face.webp', 'image/webp'), true)).toBe('still')
  })
})
