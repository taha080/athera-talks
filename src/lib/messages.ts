import type { Message, MessageKind } from '../types'

export function messagePreview(message: Pick<Message, 'body' | 'kind' | 'deletedAt'>): string {
  if (message.deletedAt) return 'Message deleted'
  if (message.kind === 'voice') return 'Voice message'
  if (message.kind === 'image') return 'Photo'
  return message.body
}

export function messageKind(value: string | null | undefined): MessageKind {
  if (value === 'voice' || value === 'image') return value
  return 'text'
}
