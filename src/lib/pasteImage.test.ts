import { describe, expect, it } from 'vitest'
import { CHAT_IMAGE_BYTES, imageFromClipboard, isGifImage, prepareChatImage } from './pasteImage'

function file(name: string, type: string, size = 12): File {
  const blob = new File([new Uint8Array(Math.min(size, 32))], name, { type })
  if (size !== blob.size) Object.defineProperty(blob, 'size', { value: size })
  return blob
}

describe('image paste', () => {
  it('ignores plain text and keeps a gif file intact', async () => {
    expect(imageFromClipboard({ items: [{ kind: 'string', type: 'text/plain' }] })).toBeNull()
    const gif = file('dance.gif', 'image/gif', 24)
    expect(isGifImage(gif)).toBe(true)
    expect(imageFromClipboard({ files: [file('note.txt', 'text/plain'), gif] })).toBe(gif)
    const prepared = await prepareChatImage(gif)
    expect(prepared).toEqual({ blob: gif, mime: 'image/gif' })
  })

  it('reads an image item from the clipboard and rejects a file over 30 MB', async () => {
    const png = file('shot.png', 'image/png')
    expect(imageFromClipboard({ items: [{ kind: 'file', type: 'image/png', getAsFile: () => png }] })).toBe(png)
    const huge = file('big.gif', 'image/gif', CHAT_IMAGE_BYTES + 1)
    await expect(prepareChatImage(huge)).rejects.toThrow(/30 MB/)
  })
})
