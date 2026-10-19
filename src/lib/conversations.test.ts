import { describe, expect, it } from 'vitest'
import { appendMessage, foldConversation } from './conversations'
import type { Conversation, Message } from '../types'

const peer = {
  id: 'sakura',
  username: 'sakura',
  avatarUrl: null,
  favouriteAnime: null,
}

const conversation: Conversation = {
  id: 'c1',
  updatedAt: '2026-10-19T10:00:00.000Z',
  peer,
  lastMessage: null,
  unread: 0,
}

function message(partial: Partial<Message>): Message {
  return {
    id: 'm1',
    conversationId: 'c1',
    senderId: 'sakura',
    body: 'hey',
    createdAt: '2026-10-19T11:00:00.000Z',
    readAt: null,
    ...partial,
  }
}

describe('chat list updates', () => {
  it('appends once and counts unread only when the chat is closed', () => {
    const first = message({})
    const list = appendMessage([], first)
    expect(appendMessage(list, first)).toHaveLength(1)
    const open = foldConversation([conversation], first, 'taha', 'c1')
    expect(open?.[0].unread).toBe(0)
    const closed = foldConversation([conversation], first, 'taha', null)
    expect(closed?.[0].unread).toBe(1)
    expect(closed?.[0].lastMessage?.body).toBe('hey')
    expect(foldConversation([conversation], message({ conversationId: 'missing' }), 'taha', null)).toBeNull()
  })
})
