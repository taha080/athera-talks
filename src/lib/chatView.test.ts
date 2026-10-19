import { describe, expect, it } from 'vitest'
import { groupPosition, groupedReactions, linkHost, linkParts, sameMinute } from './chatView'
import type { Message } from '../types'

function message(partial: Partial<Message>): Message {
  return {
    id: partial.id ?? 'm',
    conversationId: 'c',
    senderId: partial.senderId ?? 'a',
    body: partial.body ?? 'hi',
    createdAt: partial.createdAt ?? '2026-10-19T12:00:10.000Z',
    readAt: null,
    ...partial,
  }
}

describe('message grouping', () => {
  it('groups the same sender inside one minute and tails only the last', () => {
    const messages = [
      message({ id: '1', createdAt: '2026-10-19T12:00:10.000Z' }),
      message({ id: '2', createdAt: '2026-10-19T12:00:40.000Z' }),
      message({ id: '3', senderId: 'b', createdAt: '2026-10-19T12:00:50.000Z' }),
      message({ id: '4', createdAt: '2026-10-19T12:01:05.000Z' }),
    ]
    expect(sameMinute(messages[0], messages[1])).toBe(true)
    expect(groupPosition(messages, 0)).toBe('start')
    expect(groupPosition(messages, 1)).toBe('end')
    expect(groupPosition(messages, 2)).toBe('single')
    expect(groupPosition(messages, 3)).toBe('single')
  })
})

describe('links and reactions', () => {
  it('splits a link out of the sentence and keeps trailing punctuation', () => {
    expect(linkParts('See https://example.com/a, please.')).toEqual([
      { type: 'text', value: 'See ' },
      { type: 'link', value: 'https://example.com/a' },
      { type: 'text', value: ', please.' },
    ])
    expect(linkHost('https://www.example.com/a')).toBe('example.com')
  })

  it('counts reactions and marks mine', () => {
    expect(
      groupedReactions(
        [
          { userId: 'me', emoji: '👍' },
          { userId: 'you', emoji: '👍' },
          { userId: 'you', emoji: '❤️' },
        ],
        'me',
      ),
    ).toEqual([
      { emoji: '👍', count: 2, mine: true },
      { emoji: '❤️', count: 1, mine: false },
    ])
  })
})
