import wallpaperStillUrl from '../assets/wallpapers/taha-elma-still.jpg'
import wallpaperUrl from '../assets/wallpapers/taha-elma.gif'

/** Direct chat between Taha and Elma. Keyed by conversation id, not username. */
export const FORGER_CHAT_ID = 'ab67407e-01bd-432d-a902-e5113a3d8717'

export function conversationWallpaperClass(conversationId: string | null | undefined): string {
  if (conversationId === FORGER_CHAT_ID) return 'chat-wallpaper wallpaper-forger'
  return ''
}

export function conversationWallpaperMedia(conversationId: string | null | undefined): { gif: string; still: string } | null {
  if (conversationId !== FORGER_CHAT_ID) return null
  return { gif: wallpaperUrl, still: wallpaperStillUrl }
}

/** Rose bubbles belong to this conversation only. Other chats keep their own styles. */
export function conversationUsesForgerBubbles(conversationId: string | null | undefined): boolean {
  return conversationId === FORGER_CHAT_ID
}
