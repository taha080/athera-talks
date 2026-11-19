import { describe, expect, it } from 'vitest'
import { deviceLabel, parsePushPayload, pushStateNote, urlBase64ToUint8Array, PUSH_VAPID_PUBLIC_KEY } from './push'

describe('push helpers', () => {
  it('decodes the VAPID public key to a 65-byte uncompressed point', () => {
    const bytes = urlBase64ToUint8Array(PUSH_VAPID_PUBLIC_KEY)
    expect(bytes.length).toBe(65)
    expect(bytes[0]).toBe(0x04)
  })

  it('round-trips base64url without padding', () => {
    const bytes = urlBase64ToUint8Array('SGVsbG8')
    expect(Array.from(bytes)).toEqual([72, 101, 108, 108, 111])
    expect(urlBase64ToUint8Array('SGVsbG8td29ybGQ').length).toBe(11)
  })

  it('labels devices by OS and browser, never the full user agent', () => {
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36')).toBe('Windows · Chrome')
    expect(deviceLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15')).toBe('Mac · Safari')
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')).toBe('iPhone · Safari')
    expect(deviceLabel('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36')).toBe('Android · Chrome')
    expect(deviceLabel('Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0')).toBe('Linux · Firefox')
  })

  it('parses a push payload and falls back to the app name', () => {
    expect(parsePushPayload({ title: 'sakura', body: 'Hi there', conversationId: 'c1000000-0000-4000-8000-000000000001', messageId: 'm1' })).toEqual({
      title: 'sakura',
      body: 'Hi there',
      conversationId: 'c1000000-0000-4000-8000-000000000001',
      messageId: 'm1',
    })
    expect(parsePushPayload({ body: 'Hi there', conversationId: 'c1000000-0000-4000-8000-000000000001' })).toEqual({
      title: 'Athera Talks',
      body: 'Hi there',
      conversationId: 'c1000000-0000-4000-8000-000000000001',
      messageId: '',
    })
  })

  it('keeps a valid unread count for the icon badge and drops a bad one', () => {
    expect(
      parsePushPayload({ body: 'Hi', conversationId: 'c1000000-0000-4000-8000-000000000001', messageId: 'm1', unreadCount: 4 }),
    ).toEqual({
      title: 'Athera Talks',
      body: 'Hi',
      conversationId: 'c1000000-0000-4000-8000-000000000001',
      messageId: 'm1',
      unreadCount: 4,
    })
    expect(
      parsePushPayload({ body: 'Hi', conversationId: 'c1000000-0000-4000-8000-000000000001', messageId: 'm1', unreadCount: 2.7 }),
    ).toMatchObject({ unreadCount: 2 })
    for (const bad of ['4', -1, Number.NaN, Infinity, null]) {
      expect(parsePushPayload({ body: 'Hi', conversationId: 'c1000000-0000-4000-8000-000000000001', messageId: 'm1', unreadCount: bad })).not.toHaveProperty(
        'unreadCount',
      )
    }
  })

  it('rejects payloads with nothing to show', () => {
    expect(parsePushPayload(null)).toBeNull()
    expect(parsePushPayload('hello')).toBeNull()
    expect(parsePushPayload({})).toBeNull()
    expect(parsePushPayload({ title: 'sakura' })).toBeNull()
  })

  it('rejects a non-UUID conversation id and caps over-long text', () => {
    expect(
      parsePushPayload({ title: 'sakura', body: 'Hi', conversationId: 'c1', messageId: 'm1' }),
    ).toBeNull()
    expect(
      parsePushPayload({ title: 'sakura', body: 'Hi', conversationId: 42, messageId: 'm1' }),
    ).toBeNull()
    const long = parsePushPayload({
      title: 'x'.repeat(150),
      body: 'y'.repeat(300),
      conversationId: 'c1000000-0000-4000-8000-000000000001',
      messageId: 'm1',
    })
    expect(long?.title).toHaveLength(100)
    expect(long?.body).toHaveLength(200)
  })

  it('explains every push state in plain words', () => {
    expect(pushStateNote('unsupported')).toMatch(/does not support/)
    expect(pushStateNote('denied')).toMatch(/blocked/)
    expect(pushStateNote('unavailable')).toMatch(/not set up yet/)
    expect(pushStateNote('on')).toMatch(/even when Athera Talks is closed/)
    expect(pushStateNote('off')).toMatch(/Off for this device/)
  })
})
