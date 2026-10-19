import type { Conversation, Message } from '../types'

export function appendMessage(list: Message[], message: Message): Message[] {
  const index = list.findIndex((item) => item.id === message.id)
  if (index >= 0) {
    const next = list.slice()
    next[index] = message
    return next
  }
  return [...list, message].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

// Returns null when the conversation is not loaded yet, so the caller can refetch.
export function foldConversation(
  list: Conversation[],
  message: Message,
  meId: string,
  activeId: string | null,
): Conversation[] | null {
  if (!list.some((item) => item.id === message.conversationId)) return null
  const next = list.map((item) => {
    if (item.id !== message.conversationId) return item
    const mine = message.senderId === meId
    const viewing = activeId === item.id
    return {
      ...item,
      updatedAt: message.createdAt,
      lastMessage: {
        body: message.body,
        createdAt: message.createdAt,
        senderId: message.senderId,
      },
      unread: viewing || mine ? item.unread : item.unread + 1,
    }
  })
  return next.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}
