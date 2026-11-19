import { describe, expect, it } from 'vitest'
import { archivedChats, byChatOrder, chatTitle, inboxChats, PIN_LIMIT, showSenderName, totalUnread, withOpenChatRead } from './chatList'
import { foldConversation } from './conversations'
import type { Conversation } from '../types'

function chat(partial: Partial<Conversation> & Pick<Conversation, 'id' | 'updatedAt'>): Conversation {
  return {
    peer: { id: partial.id, username: partial.id, avatarUrl: null, favouriteAnime: null },
    lastMessage: null,
    unread: 0,
    ...partial,
  }
}

describe('chat list order', () => {
  const rows = [
    chat({ id: 'old', updatedAt: '2026-10-19T08:00:00.000Z' }),
    chat({ id: 'pinned-old', updatedAt: '2026-10-19T09:00:00.000Z', pinned: true }),
    chat({ id: 'fresh', updatedAt: '2026-10-19T12:00:00.000Z' }),
    chat({ id: 'pinned-new', updatedAt: '2026-10-19T11:00:00.000Z', pinned: true }),
    chat({ id: 'away', updatedAt: '2026-10-19T13:00:00.000Z', archived: true }),
  ]

  it('keeps at most a handful of pins above the rest and hides archived chats', () => {
    expect(PIN_LIMIT).toBe(3)
    expect(inboxChats(rows).map((item) => item.id)).toEqual(['pinned-new', 'pinned-old', 'fresh', 'old'])
    expect(archivedChats(rows).map((item) => item.id)).toEqual(['away'])
    expect(byChatOrder(rows[1], rows[2])).toBeLessThan(0)
  })

  it('shows a sender name only on someone else’s group message', () => {
    expect(showSenderName(false, true)).toBe(true)
    expect(showSenderName(true, true)).toBe(false)
    expect(showSenderName(false, false)).toBe(false)
    expect(showSenderName(true, false)).toBe(false)
  })

  it('names a group by its title', () => {
    expect(chatTitle(chat({ id: 'g', updatedAt: '2026-10-19T08:00:00.000Z', kind: 'group', title: 'Night watch' }))).toBe('Night watch')
    expect(chatTitle(chat({ id: 'd', updatedAt: '2026-10-19T08:00:00.000Z', peer: { id: 's', username: 'sakura', avatarUrl: null, favouriteAnime: null } }))).toBe('sakura')
  })

  it('sums unread across inbox and archived chats', () => {
    const rows = [
      chat({ id: 'a', updatedAt: '2026-10-19T08:00:00.000Z', unread: 2 }),
      chat({ id: 'b', updatedAt: '2026-10-19T09:00:00.000Z', unread: 0 }),
      chat({ id: 'c', updatedAt: '2026-10-19T10:00:00.000Z', unread: 3, archived: true }),
    ]
    expect(totalUnread(rows)).toBe(5)
    expect(totalUnread([])).toBe(0)
  })

  it('never shows an unread count on the chat that is open right now', () => {
    const rows = [
      chat({ id: 'a', updatedAt: '2026-10-19T08:00:00.000Z', unread: 1 }),
      chat({ id: 'b', updatedAt: '2026-10-19T09:00:00.000Z', unread: 2 }),
    ]
    // A stale server count for the open chat is forced to zero.
    expect(withOpenChatRead(rows, 'a').map((item) => item.unread)).toEqual([0, 2])
    expect(totalUnread(withOpenChatRead(rows, 'a'))).toBe(2)
    // No open chat: nothing changes.
    expect(withOpenChatRead(rows, null)).toBe(rows)
    expect(withOpenChatRead(rows, 'missing').map((item) => item.unread)).toEqual([1, 2])
  })

  it('brings an archived chat back when a new message arrives, unless it is muted', () => {
    const archived = chat({ id: 'c1', updatedAt: '2026-10-19T08:00:00.000Z', archived: true, muted: false })
    const opened = foldConversation(
      [archived],
      {
        id: 'm1',
        conversationId: 'c1',
        senderId: 'sakura',
        body: 'hey',
        createdAt: '2026-10-19T11:00:00.000Z',
        readAt: null,
      },
      'taha',
      null,
    )
    expect(opened?.[0].archived).toBe(false)

    const muted = foldConversation(
      [chat({ id: 'c1', updatedAt: '2026-10-19T08:00:00.000Z', archived: true, muted: true })],
      {
        id: 'm2',
        conversationId: 'c1',
        senderId: 'sakura',
        body: 'hey',
        createdAt: '2026-10-19T11:00:00.000Z',
        readAt: null,
      },
      'taha',
      null,
    )
    expect(muted?.[0].archived).toBe(true)
  })
})
