import type { Message, MessageKind } from '../types'

// A thread shows the newest page. Asking for the oldest page makes a long
// chat look deleted: the list preview is the latest message, and the thread
// ends before it.
export const MESSAGE_PAGE = 200

export function newestFirstPage<T extends { createdAt: string }>(rows: T[], limit = MESSAGE_PAGE): T[] {
  const newest = [...rows].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
  return newest.slice(0, limit).reverse()
}

export function messagePreview(message: Pick<Message, 'body' | 'kind' | 'deletedAt'>): string {
  if (message.deletedAt) return 'This message was deleted'
  if (message.kind === 'voice') return 'Voice message'
  if (message.kind === 'image') return 'Photo'
  return message.body
}

export function messageKind(value: string | null | undefined): MessageKind {
  if (value === 'voice' || value === 'image') return value
  return 'text'
}
