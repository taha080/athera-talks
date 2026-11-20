import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadFileName, downloadMedia } from './downloadMedia'

type MediaInput = Parameters<typeof downloadFileName>[0]

describe('downloadFileName', () => {
  it('uses the stored path name, shortened with a kind prefix', () => {
    expect(
      downloadFileName({
        kind: 'image',
        mediaPath: 'conv-1/user-2/550e8400-e29b-41d4-a716-446655440000.jpg',
        mediaUrl: null,
        mediaMime: 'image/jpeg',
      } satisfies MediaInput),
    ).toBe('photo-550e8400.jpg')
  })

  it('falls back to the signed URL name for a video', () => {
    expect(
      downloadFileName({
        kind: 'video',
        mediaPath: null,
        mediaUrl: 'https://example.invalid/storage/v1/object/sign/chat-videos/conv-1/user-2/abc12345-zzzz.mp4?token=abc',
        mediaMime: 'video/mp4',
      } satisfies MediaInput),
    ).toBe('video-abc12345.mp4')
  })

  it('keeps a short readable stored name', () => {
    expect(
      downloadFileName({
        kind: 'image',
        mediaPath: 'conv-1/user-2/IMG_1234.png',
        mediaUrl: null,
        mediaMime: 'image/png',
      } satisfies MediaInput),
    ).toBe('photo-IMG_1234.png')
  })

  it('falls back to the kind and the mime extension without a stored name', () => {
    expect(
      downloadFileName({ kind: 'image', mediaPath: null, mediaUrl: null, mediaMime: 'image/png' } satisfies MediaInput),
    ).toBe('photo.png')
    expect(
      downloadFileName({ kind: 'video', mediaPath: null, mediaUrl: null, mediaMime: null } satisfies MediaInput),
    ).toBe('video.mp4')
  })

  it('strips characters that are unsafe in a file name', () => {
    expect(
      downloadFileName({
        kind: 'image',
        mediaPath: 'conv-1/user-2/my photo!.jpg',
        mediaUrl: null,
        mediaMime: 'image/jpeg',
      } satisfies MediaInput),
    ).toBe('photo-myphoto.jpg')
  })
})

describe('downloadMedia', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches the URL and saves the blob under the file name', async () => {
    const blob = new Blob(['x'], { type: 'image/jpeg' })
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => blob })
    vi.stubGlobal('fetch', fetchMock)
    const anchor = { click: vi.fn(), remove: vi.fn(), href: '', download: '', rel: '' }
    const appendChild = vi.fn()
    vi.stubGlobal('document', { createElement: vi.fn(() => anchor), body: { appendChild } })
    const createObjectURL = vi.fn(() => 'blob:fake')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })

    await expect(downloadMedia('https://example.invalid/photo.jpg', 'photo-abc.jpg')).resolves.toBe(true)

    expect(fetchMock).toHaveBeenCalledWith('https://example.invalid/photo.jpg')
    expect(createObjectURL).toHaveBeenCalledWith(blob)
    expect(anchor.href).toBe('blob:fake')
    expect(anchor.download).toBe('photo-abc.jpg')
    expect(appendChild).toHaveBeenCalledWith(anchor)
    expect(anchor.click).toHaveBeenCalled()
    expect(anchor.remove).toHaveBeenCalled()
  })

  it('opens the URL in a new tab when the fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const open = vi.fn()
    vi.stubGlobal('window', { open })

    await expect(downloadMedia('https://example.invalid/photo.jpg', 'photo.jpg')).resolves.toBe(false)

    expect(open).toHaveBeenCalledWith('https://example.invalid/photo.jpg', '_blank', 'noopener')
  })

  it('opens the URL in a new tab when the download is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }))
    const open = vi.fn()
    vi.stubGlobal('window', { open })

    await expect(downloadMedia('https://example.invalid/photo.jpg', 'photo.jpg')).resolves.toBe(false)

    expect(open).toHaveBeenCalledWith('https://example.invalid/photo.jpg', '_blank', 'noopener')
  })
})
