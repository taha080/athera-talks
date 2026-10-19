import { describe, expect, it } from 'vitest'
import { THEME_GROUPS, pairedWallpaper, parseWallpaper, wallpaperClass } from './appearance'
import { messageKind, messagePreview } from './messages'
import { isOnline, presenceLabel } from './presence'
import { receiptTick } from './receipts'
import { baseMime } from './media'
import { collectRecording, createAudioRecorder, encodeWaveform, extensionForMime, mediaSendError, parseWaveform, pickAudioMime } from './voice'

describe('appearance', () => {
  it('keeps known wallpapers and falls back to plain', () => {
    expect(parseWallpaper('waves')).toBe('waves')
    expect(parseWallpaper('custom')).toBe('custom')
    expect(parseWallpaper('naruto-art')).toBe('plain')
    expect(wallpaperClass('dots')).toBe('chat-wallpaper wallpaper-dots')
    expect(wallpaperClass('custom')).toBe('chat-wallpaper wallpaper-custom')
    expect(parseWallpaper('coquette')).toBe('coquette')
  })

  it('groups the soft themes and pairs each with a wallpaper', () => {
    const labels = THEME_GROUPS.map((group) => group.label)
    expect(labels).toEqual(['Classic', 'Anime', 'Soft & Pretty'])
    const soft = THEME_GROUPS.find((group) => group.id === 'soft')
    expect(soft?.themes).toHaveLength(8)
    expect(soft?.themes.map((theme) => theme.label)).toEqual([
      'Blush Pink',
      'Lavender Dream',
      'Peach Sorbet',
      'Rose Gold',
      'Cotton Candy',
      'Mint Cream',
      'Cherry Blossom',
      'Coquette',
    ])
    expect(pairedWallpaper('cotton')).toBe('cotton')
    expect(pairedWallpaper('dark')).toBeNull()
  })
})

describe('receipts', () => {
  it('hides delivery when the peer turns receipts off', () => {
    expect(receiptTick({ readAt: '2026-10-19T00:00:00Z', deliveredAt: '2026-10-19T00:00:00Z' }, false)).toBe('sent')
    expect(receiptTick({ readAt: null, deliveredAt: '2026-10-19T00:00:00Z' }, true)).toBe('delivered')
    expect(receiptTick({ readAt: '2026-10-19T00:00:00Z', deliveredAt: null }, true)).toBe('seen')
    expect(receiptTick({ readAt: null, deliveredAt: null }, true)).toBe('sent')
  })
})

describe('voice helpers', () => {
  it('picks opus first and an m4a extension for Safari audio', () => {
    expect(pickAudioMime((type) => type.startsWith('audio/webm'))).toBe('audio/webm;codecs=opus')
    expect(pickAudioMime(() => false)).toBe('')
    expect(extensionForMime('audio/mp4')).toBe('m4a')
    expect(extensionForMime('audio/webm;codecs=opus')).toBe('webm')
    expect(parseWaveform(encodeWaveform([1.2, 140, -4]))).toEqual([1, 100, 0])
    expect(baseMime('audio/webm;codecs=opus')).toBe('audio/webm')
    expect(baseMime('video/webm')).toBe('audio/webm')
    expect(baseMime('video/mp4')).toBe('audio/mp4')
  })

  it('falls through when the first recorder type throws', () => {
    const stream = {} as MediaStream
    const created: string[] = []
    const chosen = createAudioRecorder(stream, {
      supported: (type) => type === 'audio/webm;codecs=opus' || type === 'audio/mp4',
      create: (_stream, mimeType) => {
        created.push(mimeType)
        if (mimeType.startsWith('audio/webm')) throw new Error('unsupported')
        return { mimeType } as MediaRecorder
      },
    })
    expect(created).toEqual(['audio/webm;codecs=opus', 'audio/mp4'])
    expect(chosen.mimeType).toBe('audio/mp4')
    expect(mediaSendError('new row violates row-level security policy')).toMatch(/accepted contact/)
    expect(mediaSendError('You can only message an accepted contact.')).toMatch(/accepted contact/)
    expect(mediaSendError('mime type audio/webm is not supported', 'voice')).toMatch(/format was rejected/)
  })

  it('keeps a chunk that arrives as the recorder stops', async () => {
    const chunks: Blob[] = []
    let onStop: (() => void) | null = null
    const media = {
      state: 'recording' as RecordingState,
      addEventListener: (_name: string, listener: () => void) => {
        onStop = listener
      },
      requestData: () => {
        chunks.push(new Blob(['hello']))
      },
      stop: () => {
        media.state = 'inactive'
        chunks.push(new Blob(['voice']))
        onStop?.()
      },
    }
    const blob = await collectRecording(media as unknown as MediaRecorder, chunks, 'audio/webm;codecs=opus')
    expect(blob.type).toBe('audio/webm')
    expect(blob.size).toBe(10)
  })
})

describe('message preview', () => {
  it('labels voice, photos, and deleted messages', () => {
    expect(messagePreview({ body: 'hi', kind: 'text', deletedAt: null })).toBe('hi')
    expect(messagePreview({ body: '', kind: 'voice', deletedAt: null })).toBe('Voice message')
    expect(messagePreview({ body: '', kind: 'image', deletedAt: null })).toBe('Photo')
    expect(messagePreview({ body: 'secret', kind: 'text', deletedAt: '2026-10-19T00:00:00Z' })).toBe('Message deleted')
    expect(messageKind('voice')).toBe('voice')
    expect(messageKind('nope')).toBe('text')
  })
})

describe('presence', () => {
  const now = Date.parse('2026-10-19T12:00:00Z')

  it('treats a fresh heartbeat as online', () => {
    expect(isOnline(new Date(now - 10_000).toISOString(), now)).toBe(true)
    expect(presenceLabel(new Date(now - 10_000).toISOString(), now)).toBe('online')
    expect(presenceLabel(new Date(now - 5 * 60_000).toISOString(), now)).toBe('last seen 5m ago')
    expect(presenceLabel(null, now)).toBe('')
  })
})
