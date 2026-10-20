import { fitImage } from './image'

export const CHAT_IMAGE_BYTES = 31_457_280

const NAMED = ['.gif', '.png', '.jpg', '.jpeg', '.webp']

export function isGifImage(file: { type?: string; name?: string }): boolean {
  const type = (file.type ?? '').toLowerCase().split(';')[0]?.trim() ?? ''
  return type === 'image/gif' || (file.name ?? '').toLowerCase().endsWith('.gif')
}

export function isChatImage(file: { type?: string; name?: string }): boolean {
  const type = (file.type ?? '').toLowerCase().split(';')[0]?.trim() ?? ''
  if (type.startsWith('image/')) return true
  const name = (file.name ?? '').toLowerCase()
  return NAMED.some((suffix) => name.endsWith(suffix))
}

export function firstImageFile(files: ArrayLike<File> | null | undefined): File | null {
  if (!files) return null
  for (const file of Array.from(files)) {
    if (isChatImage(file)) return file
  }
  return null
}

type ClipItem = { kind: string; type: string; getAsFile?: () => File | null }

export function imageFromClipboard(data: { files?: ArrayLike<File> | null; items?: ArrayLike<ClipItem> | null } | null): File | null {
  if (!data) return null
  const fromFiles = firstImageFile(data.files)
  if (fromFiles) return fromFiles
  if (!data.items) return null
  for (const item of Array.from(data.items)) {
    if (item.kind !== 'file' || !item.type.toLowerCase().startsWith('image/')) continue
    const file = item.getAsFile?.() ?? null
    if (file && isChatImage(file)) return file
  }
  return null
}

export function imageExtension(mime: string): string {
  const base = mime.split(';')[0]?.trim().toLowerCase() ?? ''
  if (base === 'image/gif') return 'gif'
  if (base === 'image/png') return 'png'
  if (base === 'image/webp') return 'webp'
  return 'jpg'
}

export async function prepareChatImage(file: File): Promise<{ blob: Blob; mime: string }> {
  if (!isChatImage(file)) throw new Error('Choose an image file.')
  if (file.size > CHAT_IMAGE_BYTES) throw new Error('Choose an image under 30 MB.')
  if (isGifImage(file)) return { blob: file, mime: 'image/gif' }
  const blob = await fitImage(file, 1600)
  if (blob.size > CHAT_IMAGE_BYTES) throw new Error('Choose an image under 30 MB.')
  return { blob, mime: 'image/jpeg' }
}
