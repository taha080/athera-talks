import { describe, expect, it } from 'vitest'
import {
  STORY_TEXT_MAX,
  TEXT_GRADIENTS,
  authorHasUnseen,
  formatStoryTime,
  gradientCss,
  groupStoriesByAuthor,
  isExpired,
  storyCaptionIssue,
  storyDurationMs,
  storyExpiresAt,
  storyPhotoIssue,
  storyTextIssue,
  type Story,
} from './stories'

function story(partial: Partial<Story> & { id: string; authorId: string }): Story {
  return {
    author: { id: partial.authorId, username: partial.authorId, avatarUrl: null, favouriteAnime: null },
    kind: 'text',
    mediaPath: null,
    mediaUrl: null,
    text: 'hello',
    background: 'sunset',
    caption: '',
    createdAt: '2026-10-26T10:00:00.000Z',
    expiresAt: '2026-10-27T10:00:00.000Z',
    viewCount: 0,
    viewedByMe: false,
    ...partial,
  }
}

describe('stories', () => {
  it('expires exactly 24 hours after creation', () => {
    expect(storyExpiresAt('2026-10-26T10:00:00.000Z')).toBe('2026-10-27T10:00:00.000Z')
  })

  it('is expired at the 24 hour boundary, not before', () => {
    const item = story({ id: 's1', authorId: 'u1' })
    expect(isExpired(item, new Date('2026-10-27T09:59:59.999Z'))).toBe(false)
    expect(isExpired(item, new Date('2026-10-27T10:00:00.000Z'))).toBe(true)
    expect(isExpired(item, new Date('2026-10-27T10:00:00.001Z'))).toBe(true)
  })

  it('photo stories show 5s and text stories 7s', () => {
    expect(storyDurationMs({ kind: 'photo' })).toBe(5000)
    expect(storyDurationMs({ kind: 'text' })).toBe(7000)
  })

  it('groups by author, own group first, unseen groups before seen ones', () => {
    const now = new Date('2026-10-26T12:00:00.000Z')
    const rows = [
      story({ id: 'a1', authorId: 'u-seen', viewedByMe: true, createdAt: '2026-10-26T11:00:00.000Z', expiresAt: '2026-10-27T11:00:00.000Z' }),
      story({ id: 'b1', authorId: 'u-new', viewedByMe: false, createdAt: '2026-10-26T09:00:00.000Z', expiresAt: '2026-10-27T09:00:00.000Z' }),
      story({ id: 'c1', authorId: 'me', viewedByMe: true, createdAt: '2026-10-26T08:00:00.000Z', expiresAt: '2026-10-27T08:00:00.000Z' }),
      story({ id: 'b2', authorId: 'u-new', viewedByMe: true, createdAt: '2026-10-26T10:30:00.000Z', expiresAt: '2026-10-27T10:30:00.000Z' }),
    ]
    const groups = groupStoriesByAuthor(rows, 'me', now)
    expect(groups.map((group) => group.author.id)).toEqual(['me', 'u-new', 'u-seen'])
    const fresh = groups.find((group) => group.author.id === 'u-new')
    expect(fresh?.stories.map((item) => item.id)).toEqual(['b1', 'b2'])
    expect(fresh?.unseen).toBe(true)
    expect(groups.find((group) => group.author.id === 'u-seen')?.unseen).toBe(false)
  })

  it('a group with one unviewed story counts as unseen', () => {
    const group = {
      author: { id: 'u1', username: 'ren', avatarUrl: null, favouriteAnime: null },
      stories: [
        story({ id: 's1', authorId: 'u1', viewedByMe: true }),
        story({ id: 's2', authorId: 'u1', viewedByMe: false }),
      ],
      unseen: true,
    }
    expect(authorHasUnseen(group)).toBe(true)
    expect(authorHasUnseen({ ...group, unseen: false })).toBe(false)
  })

  it('drops expired stories from groups', () => {
    const now = new Date('2026-10-27T12:00:00.000Z')
    const rows = [
      story({ id: 'old', authorId: 'u1', createdAt: '2026-10-26T10:00:00.000Z', expiresAt: '2026-10-27T10:00:00.000Z' }),
      story({ id: 'live', authorId: 'u1', createdAt: '2026-10-26T13:00:00.000Z', expiresAt: '2026-10-27T13:00:00.000Z' }),
    ]
    const groups = groupStoriesByAuthor(rows, 'me', now)
    expect(groups).toHaveLength(1)
    expect(groups[0].stories.map((item) => item.id)).toEqual(['live'])
  })

  it('formats story times as just now, minutes and hours', () => {
    const now = new Date('2026-10-26T12:00:00.000Z')
    expect(formatStoryTime('2026-10-26T11:59:30.000Z', now)).toBe('just now')
    expect(formatStoryTime('2026-10-26T11:45:00.000Z', now)).toBe('15m ago')
    expect(formatStoryTime('2026-10-26T10:00:00.000Z', now)).toBe('2h ago')
    expect(formatStoryTime('2026-10-25T12:00:00.000Z', now)).toBe('1d ago')
  })

  it('validates text, caption and photo input', () => {
    expect(storyTextIssue('')).toBe('Write something first.')
    expect(storyTextIssue('  ')).toBe('Write something first.')
    expect(storyTextIssue('x'.repeat(STORY_TEXT_MAX + 1))).toContain('280')
    expect(storyTextIssue('hello')).toBeNull()
    expect(storyCaptionIssue('x'.repeat(141))).toContain('140')
    expect(storyCaptionIssue('nice')).toBeNull()
    expect(storyPhotoIssue({ size: 100, type: 'video/mp4' })).toBe('Pick an image file.')
    expect(storyPhotoIssue({ size: 31 * 1024 * 1024, type: 'image/jpeg' })).toBe('That photo is over 30 MB.')
    expect(storyPhotoIssue({ size: 1024, type: 'image/png' })).toBeNull()
  })

  it('has six gradients and falls back to the first one', () => {
    expect(TEXT_GRADIENTS).toHaveLength(6)
    expect(gradientCss('ocean')).toContain('#0ea5e9')
    expect(gradientCss('nope')).toBe(TEXT_GRADIENTS[0].css)
    expect(gradientCss(null)).toBe(TEXT_GRADIENTS[0].css)
  })
})
