import { describe, expect, it } from 'vitest'
import { CHAT_VIDEO_BYTES, assertVideoSize, attachmentFromClipboard, isChatVideo, videoDurationSeconds, videoExtension, videoMime } from './chatVideo'

function file(name: string, type: string, size = 12): File {
  const blob = new File([new Uint8Array(Math.min(size, 32))], name, { type })
  if (size !== blob.size) Object.defineProperty(blob, 'size', { value: size })
  return blob
}

describe('chat video', () => {
  it('accepts mp4, webm, and mov without reading the file', () => {
    expect(isChatVideo(file('clip.mp4', 'video/mp4'))).toBe(true)
    expect(isChatVideo(file('clip.webm', 'video/webm'))).toBe(true)
    expect(isChatVideo(file('clip.mov', 'video/quicktime'))).toBe(true)
    expect(isChatVideo(file('clip.mov', ''))).toBe(true)
    expect(isChatVideo(file('shot.png', 'image/png'))).toBe(false)
    expect(videoMime(file('clip.mov', ''))).toBe('video/quicktime')
    expect(videoExtension('video/mp4')).toBe('mp4')
    expect(videoExtension('video/webm')).toBe('webm')
  })

  it('caps size at 50 MB and does not cap duration', () => {
    expect(() => assertVideoSize(CHAT_VIDEO_BYTES)).not.toThrow()
    expect(() => assertVideoSize(CHAT_VIDEO_BYTES + 1)).toThrow(/50 MB/)
    expect(videoDurationSeconds(7200.4)).toBe(7200)
    expect(videoDurationSeconds(Number.POSITIVE_INFINITY)).toBeNull()
    expect(videoDurationSeconds(-1)).toBeNull()
  })

  it('reads a video from the clipboard and still keeps images', () => {
    const video = file('clip.mp4', 'video/mp4')
    const image = file('shot.png', 'image/png')
    expect(attachmentFromClipboard({ items: [{ kind: 'file', type: 'video/mp4', getAsFile: () => video }] })).toBe(video)
    expect(attachmentFromClipboard({ files: [image, video] })).toBe(image)
    expect(attachmentFromClipboard({ items: [{ kind: 'string', type: 'text/plain' }] })).toBeNull()
  })
})
