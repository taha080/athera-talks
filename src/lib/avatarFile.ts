import { squareAvatar } from './image'

export const CREATOR_GIF_MESSAGE = 'Animated GIF avatars are for Premium and the creator.'
export const AVATAR_BYTES = 31_457_280

const STILL_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])

export function isGifAvatar(file: { name: string; type: string }): boolean {
  const type = file.type.toLowerCase().split(';')[0]?.trim() ?? ''
  return type === 'image/gif' || file.name.toLowerCase().endsWith('.gif')
}

// 'gif' keeps the original bytes. 'still' is squared and saved as JPEG.
export function avatarKind(file: { name: string; type: string; size: number }, creator: boolean): 'gif' | 'still' {
  if (isGifAvatar(file)) {
    if (!creator) throw new Error(CREATOR_GIF_MESSAGE)
    if (file.size > AVATAR_BYTES) throw new Error('Choose a GIF under 30 MB.')
    return 'gif'
  }
  const type = file.type.toLowerCase().split(';')[0]?.trim() ?? ''
  const name = file.name.toLowerCase()
  if (type && !type.startsWith('image/')) throw new Error('Choose an image file.')
  const stillName = /\.(jpe?g|png|webp)$/.test(name)
  if ((type && !STILL_TYPES.has(type)) || (!type && !stillName)) {
    throw new Error('Choose a PNG, JPG, or WebP image.')
  }
  if (file.size > AVATAR_BYTES) throw new Error('Choose an image under 30 MB.')
  return 'still'
}

export async function prepareAvatar(file: File, creator: boolean): Promise<{ blob: Blob; extension: 'gif' | 'jpg' }> {
  const kind = avatarKind(file, creator)
  if (kind === 'gif') return { blob: file, extension: 'gif' }
  return { blob: await squareAvatar(file), extension: 'jpg' }
}
