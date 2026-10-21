import { isChatImage } from './pasteImage'

export const CHAT_VIDEO_BYTES = 52_428_800

const MIME = new Set(['video/mp4', 'video/webm', 'video/quicktime'])

function cleanType(type?: string): string {
  return (type ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
}

export function isChatVideo(file: { type?: string; name?: string }): boolean {
  const type = cleanType(file.type)
  if (MIME.has(type)) return true
  const name = (file.name ?? '').toLowerCase()
  return name.endsWith('.mp4') || name.endsWith('.webm') || name.endsWith('.mov')
}

export function videoMime(file: { type?: string; name?: string }): string {
  const type = cleanType(file.type)
  if (MIME.has(type)) return type
  const name = (file.name ?? '').toLowerCase()
  if (name.endsWith('.webm')) return 'video/webm'
  if (name.endsWith('.mov')) return 'video/quicktime'
  return 'video/mp4'
}

export function videoExtension(mime: string): string {
  const base = cleanType(mime)
  if (base === 'video/webm') return 'webm'
  if (base === 'video/quicktime') return 'mov'
  return 'mp4'
}

export function assertVideoSize(size: number): void {
  if (size > CHAT_VIDEO_BYTES) throw new Error('Choose a video under 50 MB.')
}

// Duration is recorded as-is. Nothing here shortens or rejects a long video.
export function videoDurationSeconds(duration: number): number | null {
  if (!Number.isFinite(duration) || duration < 0) return null
  return Math.round(duration)
}

type ClipItem = { kind: string; type: string; getAsFile?: () => File | null }

export function firstChatAttachment(files: ArrayLike<File> | null | undefined): File | null {
  if (!files) return null
  for (const file of Array.from(files)) {
    if (isChatImage(file) || isChatVideo(file)) return file
  }
  return null
}

export function attachmentFromClipboard(data: { files?: ArrayLike<File> | null; items?: ArrayLike<ClipItem> | null } | null): File | null {
  if (!data) return null
  const fromFiles = firstChatAttachment(data.files)
  if (fromFiles) return fromFiles
  if (!data.items) return null
  for (const item of Array.from(data.items)) {
    if (item.kind !== 'file') continue
    const file = item.getAsFile?.() ?? null
    if (file && (isChatImage(file) || isChatVideo(file))) return file
  }
  return null
}
