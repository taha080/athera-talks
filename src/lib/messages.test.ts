import { describe, expect, it } from 'vitest'
import { MESSAGE_PAGE, newestFirstPage } from './messages'

describe('newest message page', () => {
  it('keeps a short thread in chronological order', () => {
    const page = newestFirstPage([
      { id: 'b', createdAt: '2026-10-20T18:34:30.000Z' },
      { id: 'a', createdAt: '2026-10-20T18:17:23.000Z' },
    ])
    expect(page.map((row) => row.id)).toEqual(['a', 'b'])
  })

  it('drops the oldest messages once a chat passes the page, and keeps the newest', () => {
    const rows = Array.from({ length: MESSAGE_PAGE + 28 }, (_, index) => ({
      id: String(index),
      createdAt: new Date(Date.UTC(2026, 9, 20, 18, 0, index)).toISOString(),
    }))
    const page = newestFirstPage(rows)
    expect(page).toHaveLength(MESSAGE_PAGE)
    expect(page[0]?.id).toBe('28')
    expect(page.at(-1)?.id).toBe(String(MESSAGE_PAGE + 27))
    expect(page.some((row) => row.id === '0')).toBe(false)
  })
})
