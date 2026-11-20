import type { Message } from '../types'

type MediaMessage = Pick<Message, 'kind' | 'mediaPath' | 'mediaUrl' | 'mediaMime'>

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
}

function extensionFor(message: MediaMessage): string {
  const mime = (message.mediaMime ?? '').split(';')[0]?.trim().toLowerCase()
  if (mime && EXTENSION_BY_MIME[mime]) return EXTENSION_BY_MIME[mime]
  return message.kind === 'video' ? 'mp4' : 'jpg'
}

function baseName(value: string | null | undefined): string | null {
  if (!value) return null
  const path = value.split('?')[0]?.split('#')[0] ?? ''
  const name = path.split('/').filter(Boolean).pop() ?? ''
  return name || null
}

/**
 * File name to save a received photo or video under. The stored path is
 * `<conversation>/<sender>/<uuid>.<ext>`, so the readable part is the
 * photo/video prefix plus the first bit of the stored name; without a
 * stored name it falls back to the mime type.
 */
export function downloadFileName(message: MediaMessage): string {
  const kindWord = message.kind === 'video' ? 'video' : 'photo'
  const ext = extensionFor(message)
  const raw = baseName(message.mediaPath) ?? baseName(message.mediaUrl)
  if (raw) {
    const cleaned = raw.replace(/[^A-Za-z0-9._-]/g, '').replace(/^\.+/, '')
    const dot = cleaned.lastIndexOf('.')
    const stem = dot > 0 ? cleaned.slice(0, dot) : cleaned
    const hasExt = dot > 0 && /^[A-Za-z0-9]{2,5}$/.test(cleaned.slice(dot + 1))
    if (stem) {
      const short = stem.length > 12 ? stem.slice(0, 8) : stem
      return `${kindWord}-${short}.${hasExt ? cleaned.slice(dot + 1) : ext}`
    }
  }
  return `${kindWord}.${ext}`
}

/**
 * Save a media URL to the device. Fetches the (signed) URL as a blob and
 * triggers a browser download, which lands in Downloads on mobile
 * browsers. Returns true when the download started. When the fetch fails
 * (for example a storage CORS refusal) it opens the file in a new tab
 * instead, where the user can still save it, and returns false.
 */
export async function downloadMedia(url: string, filename: string): Promise<boolean> {
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Download failed: ${response.status}`)
    const blob = await response.blob()
    if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
      throw new Error('Download is not available here')
    }
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = filename
    anchor.rel = 'noopener'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    globalThis.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    return true
  } catch {
    try {
      if (typeof window !== 'undefined' && window.open) {
        window.open(url, '_blank', 'noopener')
      }
    } catch {
      // The fallback could not open the file either; the caller reports it.
    }
    return false
  }
}
