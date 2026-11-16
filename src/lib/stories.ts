// Athera Stories: types and pure helpers.
//
// Stories are WhatsApp Status / Instagram Stories style: a photo or a
// short text on a gradient, visible to accepted contacts only, gone after
// 24 hours. The same Profile shape is reused everywhere (username,
// avatarUrl, favouriteAnime), so a story author is the same profile shown
// in a chat.
//
// Two stores implement the same interface (see services/storyStore.ts for
// the local fallback and services/storyBackend.ts for Supabase): the row
// prefers Supabase when its tables exist and falls back to the local store
// otherwise, exactly like the existing Communities pattern.

import type { Profile } from '../types'

export type StoryKind = 'photo' | 'text'

export type Story = {
  id: string
  authorId: string
  author: Profile
  kind: StoryKind
  /** Storage path in the private `stories` bucket (photo stories only). */
  mediaPath: string | null
  /** Signed URL (Supabase) or data URL (local demo) for a photo story. */
  mediaUrl: string | null
  /** Text stories only. */
  text: string | null
  /** Gradient id from TEXT_GRADIENTS (text stories only). */
  background: string | null
  caption: string | null
  createdAt: string
  expiresAt: string
  viewCount: number
  viewedByMe: boolean
}

export type StoryGroup = {
  author: Profile
  stories: Story[]
  /** True when at least one story in the group is still unviewed. */
  unseen: boolean
}

/** Stories live for 24 hours, then disappear. */
export const STORY_TTL_MS = 24 * 60 * 60 * 1000
/** A photo story advances after 5 seconds, like WhatsApp Status. */
export const STORY_PHOTO_MS = 5000
/** A text story advances after 7 seconds, so it can be read. */
export const STORY_TEXT_MS = 7000
/** Photo stories share the 30 MB cap chat images use. */
export const STORY_MAX_PHOTO_BYTES = 30 * 1024 * 1024
export const STORY_TEXT_MAX = 280
export const STORY_CAPTION_MAX = 140

export type TextGradient = { id: string; css: string; label: string }

export const TEXT_GRADIENTS: TextGradient[] = [
  { id: 'sunset', css: 'linear-gradient(160deg, #f97316, #db2777, #7c3aed)', label: 'Sunset' },
  { id: 'ocean', css: 'linear-gradient(160deg, #0ea5e9, #2563eb, #1e1b4b)', label: 'Ocean' },
  { id: 'forest', css: 'linear-gradient(160deg, #22c55e, #15803d, #052e16)', label: 'Forest' },
  { id: 'sakura', css: 'linear-gradient(160deg, #f472b6, #a855f7, #4c1d95)', label: 'Sakura' },
  { id: 'ember', css: 'linear-gradient(160deg, #f59e0b, #dc2626, #450a0a)', label: 'Ember' },
  { id: 'midnight', css: 'linear-gradient(160deg, #334155, #0f172a, #000000)', label: 'Midnight' },
]

export function gradientCss(id: string | null): string {
  return TEXT_GRADIENTS.find((item) => item.id === id)?.css ?? TEXT_GRADIENTS[0].css
}

export function storyExpiresAt(createdAt: string | Date): string {
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt)
  return new Date(created.getTime() + STORY_TTL_MS).toISOString()
}

export function isExpired(story: { expiresAt: string }, now = new Date()): boolean {
  return new Date(story.expiresAt).getTime() <= now.getTime()
}

/** How long one story stays on screen in the viewer. */
export function storyDurationMs(story: { kind: StoryKind }): number {
  return story.kind === 'text' ? STORY_TEXT_MS : STORY_PHOTO_MS
}

/**
 * Group live stories by author, newest story first inside each group.
 * The caller's own group comes first, then groups with unviewed stories
 * (latest story first), then fully viewed groups (latest story first).
 */
export function groupStoriesByAuthor(stories: Story[], meId: string, now = new Date()): StoryGroup[] {
  const live = stories.filter((story) => !isExpired(story, now))
  const byAuthor = new Map<string, Story[]>()
  for (const story of live) {
    const list = byAuthor.get(story.authorId) ?? []
    list.push(story)
    byAuthor.set(story.authorId, list)
  }
  const groups: StoryGroup[] = []
  for (const list of byAuthor.values()) {
    const ordered = [...list].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    groups.push({
      author: ordered[0].author,
      stories: ordered,
      unseen: ordered.some((story) => !story.viewedByMe),
    })
  }
  const latest = (group: StoryGroup) => new Date(group.stories[group.stories.length - 1].createdAt).getTime()
  return groups.sort((a, b) => {
    if (a.author.id === meId && b.author.id !== meId) return -1
    if (b.author.id === meId && a.author.id !== meId) return 1
    if (a.unseen !== b.unseen) return a.unseen ? -1 : 1
    return latest(b) - latest(a)
  })
}

export function authorHasUnseen(group: StoryGroup): boolean {
  return group.unseen
}

export function formatStoryTime(iso: string, now = new Date()): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function storyTextIssue(text: string): string | null {
  const clean = text.trim()
  if (clean.length < 1) return 'Write something first.'
  if (clean.length > STORY_TEXT_MAX) return `Keep it under ${STORY_TEXT_MAX} characters.`
  return null
}

export function storyCaptionIssue(caption: string): string | null {
  if (caption.trim().length > STORY_CAPTION_MAX) return `Keep the caption under ${STORY_CAPTION_MAX} characters.`
  return null
}

export function storyPhotoIssue(file: { size: number; type: string }): string | null {
  if (!file.type.toLowerCase().startsWith('image/')) return 'Pick an image file.'
  if (file.size > STORY_MAX_PHOTO_BYTES) return 'That photo is over 30 MB.'
  return null
}
