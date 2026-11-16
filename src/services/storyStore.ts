// Story store interface shared by the local fallback and the Supabase
// implementation. The row only talks to this interface, so a missing
// Supabase migration can never crash Stories: the caller falls back to
// the local store instead, exactly like Communities.

import { demoCommunityProfiles } from '../lib/communities'
import {
  STORY_CAPTION_MAX,
  STORY_TEXT_MAX,
  isExpired,
  storyCaptionIssue,
  storyExpiresAt,
  storyPhotoIssue,
  storyTextIssue,
  type Story,
} from '../lib/stories'
import { blobToDataUrl, fitImage } from '../lib/image'
import type { Profile } from '../types'

export class StoriesNotReadyError extends Error {
  constructor() {
    super('Stories tables are not set up yet.')
    this.name = 'StoriesNotReadyError'
  }
}

export type StoryStore = {
  listStories(): Promise<Story[]>
  postPhoto(input: { file: Blob; caption: string }): Promise<Story>
  postText(input: { text: string; background: string }): Promise<Story>
  markViewed(storyId: string): Promise<void>
  deleteStory(storyId: string): Promise<void>
  subscribe(onChange: () => void): () => void
}

type LocalState = {
  stories: Story[]
  profiles: Profile[]
}

const STORAGE_KEY = 'athera:stories-v1'

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`
}

function seedState(me: Profile): LocalState {
  const profiles = demoCommunityProfiles(me)
  const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
  const sakura = profiles.find((item) => item.username === 'sakura') ?? profiles[1]
  const ren = profiles.find((item) => item.username === 'ren') ?? profiles[2]
  const seed = (id: string, author: Profile, text: string, background: string, createdAt: string): Story => ({
    id,
    authorId: author.id,
    author,
    kind: 'text',
    mediaPath: null,
    mediaUrl: null,
    text,
    background,
    caption: '',
    createdAt,
    expiresAt: storyExpiresAt(createdAt),
    viewCount: 0,
    viewedByMe: false,
  })
  return {
    stories: [
      seed('story-demo-sakura', sakura, 'Frieren episode 12 tonight — bring snacks.', 'sakura', hoursAgo(2)),
      seed('story-demo-ren', ren, 'Attack on Titan rewatch, day 3.', 'ocean', hoursAgo(5)),
    ],
    profiles,
  }
}

function loadState(me: Profile): LocalState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return seedState(me)
    const parsed = JSON.parse(raw) as LocalState
    if (!Array.isArray(parsed.stories) || !Array.isArray(parsed.profiles)) return seedState(me)
    return parsed
  } catch {
    return seedState(me)
  }
}

export function createLocalStoryStore(me: Profile): StoryStore {
  let state = loadState(me)
  const listeners = new Set<() => void>()

  function save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // A full localStorage (large photos) must not break posting: the
      // in-memory copy still works for this session.
    }
    for (const listener of listeners) listener()
  }

  function live(): Story[] {
    const now = new Date()
    return state.stories
      .filter((story) => !isExpired(story, now))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  return {
    async listStories() {
      return live()
    },
    async postPhoto(input) {
      const issue = storyPhotoIssue({ size: input.file.size, type: input.file.type })
      if (issue) throw new Error(issue)
      const captionIssue = storyCaptionIssue(input.caption)
      if (captionIssue) throw new Error(captionIssue)
      // Local demo only: shrink the photo and keep it as a data URL, so
      // localStorage stays small. Live uploads use the `stories` bucket.
      const shrunk = input.file.type.toLowerCase().includes('gif') ? input.file : await fitImage(input.file, 1080)
      const mediaUrl = await blobToDataUrl(shrunk)
      const createdAt = new Date().toISOString()
      const created: Story = {
        id: newId('story'),
        authorId: me.id,
        author: me,
        kind: 'photo',
        mediaPath: null,
        mediaUrl,
        text: null,
        background: null,
        caption: input.caption.trim().slice(0, STORY_CAPTION_MAX),
        createdAt,
        expiresAt: storyExpiresAt(createdAt),
        viewCount: 0,
        viewedByMe: true,
      }
      state = { ...state, stories: [created, ...state.stories] }
      save()
      return created
    },
    async postText(input) {
      const issue = storyTextIssue(input.text)
      if (issue) throw new Error(issue)
      const createdAt = new Date().toISOString()
      const created: Story = {
        id: newId('story'),
        authorId: me.id,
        author: me,
        kind: 'text',
        mediaPath: null,
        mediaUrl: null,
        text: input.text.trim().slice(0, STORY_TEXT_MAX),
        background: input.background,
        caption: '',
        createdAt,
        expiresAt: storyExpiresAt(createdAt),
        viewCount: 0,
        viewedByMe: true,
      }
      state = { ...state, stories: [created, ...state.stories] }
      save()
      return created
    },
    async markViewed(storyId) {
      let changed = false
      state = {
        ...state,
        stories: state.stories.map((story) => {
          if (story.id !== storyId || story.viewedByMe) return story
          changed = true
          return { ...story, viewedByMe: true, viewCount: story.viewCount + 1 }
        }),
      }
      if (changed) save()
    },
    async deleteStory(storyId) {
      const found = state.stories.find((story) => story.id === storyId)
      if (!found) throw new Error('That story is gone already.')
      if (found.authorId !== me.id) throw new Error('Only the author can delete a story.')
      state = { ...state, stories: state.stories.filter((story) => story.id !== storyId) }
      save()
    },
    subscribe(onChange) {
      listeners.add(onChange)
      return () => {
        listeners.delete(onChange)
      }
    },
  }
}
