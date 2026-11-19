// Supabase-backed Stories store. This is only used when the stories
// migration has been applied; otherwise the first query throws
// StoriesNotReadyError and the row falls back to the local store
// (see services/storyStore.ts) instead of crashing.
//
// Table names match supabase/migrations/20261026120000_stories.sql.
// No secret is read here: only the browser anon key via getSupabase().

import { getSupabase } from '../lib/supabase'
import {
  STORY_CAPTION_MAX,
  STORY_TEXT_MAX,
  storyCaptionIssue,
  storyExpiresAt,
  storyPhotoIssue,
  storyTextIssue,
  type Story,
  type StoryKind,
} from '../lib/stories'
import { StoriesNotReadyError, type StoryStore } from './storyStore'
import type { Profile } from '../types'

function isMissingTable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const code = (error as { code?: string })?.code
  return code === '42P01' || code === 'PGRST205' || /relation .* does not exist|Could not find the table|PGRST205/i.test(message)
}

function notReady(error: unknown): never {
  if (isMissingTable(error)) throw new StoriesNotReadyError()
  throw new Error(storyErrorMessage(error))
}

// PostgREST errors are plain objects ({ message, code, ... }), not Error
// instances, so `instanceof Error` hid the real message behind a generic
// text. Keep the real message so the next failure can be diagnosed.
export function storyErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  const message = (error as { message?: unknown })?.message
  if (typeof message === 'string' && message) return message
  return 'Stories could not be loaded.'
}

type StoryRow = {
  id: string
  author_id: string
  kind: string
  media_path: string | null
  text: string | null
  background: string | null
  caption: string | null
  created_at: string
  expires_at: string
  profiles?: { username: string; avatar_url: string | null; favourite_anime: string | null } | null
}

function kindOf(value: string): StoryKind {
  return value === 'photo' ? 'photo' : 'text'
}

function imageExtension(mime: string): string {
  const base = mime.toLowerCase().split(';')[0]?.trim()
  if (base === 'image/png') return 'png'
  if (base === 'image/webp') return 'webp'
  if (base === 'image/gif') return 'gif'
  return 'jpg'
}

export async function trySupabaseStoryStore(me: Profile): Promise<StoryStore | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  try {
    const { error } = await supabase.from('stories').select('id').limit(1)
    if (error) {
      if (isMissingTable(error)) return null
      throw new Error(error.message)
    }
  } catch (error) {
    if (error instanceof StoriesNotReadyError) return null
    if (isMissingTable(error)) return null
    throw error
  }
  return createSupabaseStoryStore(me)
}

function createSupabaseStoryStore(me: Profile): StoryStore {
  const client = () => {
    const supabase = getSupabase()
    if (!supabase) throw new StoriesNotReadyError()
    return supabase
  }

  async function signPhotoUrls(paths: string[]): Promise<Map<string, string>> {
    const urls = new Map<string, string>()
    const unique = [...new Set(paths.filter(Boolean))]
    if (unique.length === 0) return urls
    const { data, error } = await client().storage.from('stories').createSignedUrls(unique, 60 * 60)
    if (error) notReady(error)
    for (const item of data ?? []) {
      if (item.signedUrl && item.path) urls.set(item.path, item.signedUrl)
    }
    return urls
  }

  function mapStory(
    row: StoryRow,
    views: Map<string, { count: number; seen: boolean }>,
    mediaUrls: Map<string, string>,
  ): Story {
    const seen = views.get(row.id)
    return {
      id: row.id,
      authorId: row.author_id,
      author: {
        id: row.author_id,
        username: row.profiles?.username ?? 'fan',
        avatarUrl: row.profiles?.avatar_url ?? null,
        favouriteAnime: row.profiles?.favourite_anime ?? null,
      },
      kind: kindOf(row.kind),
      mediaPath: row.media_path,
      mediaUrl: row.media_path ? (mediaUrls.get(row.media_path) ?? null) : null,
      text: row.text,
      background: row.background,
      caption: row.caption,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      viewCount: seen?.count ?? 0,
      viewedByMe: seen?.seen ?? false,
    }
  }

  async function fetchViews(): Promise<Map<string, { count: number; seen: boolean }>> {
    const { data, error } = await client().from('story_views').select('story_id, viewer_id')
    if (error) notReady(error)
    const views = new Map<string, { count: number; seen: boolean }>()
    for (const row of (data ?? []) as { story_id: string; viewer_id: string }[]) {
      const entry = views.get(row.story_id) ?? { count: 0, seen: false }
      entry.count += 1
      if (row.viewer_id === me.id) entry.seen = true
      views.set(row.story_id, entry)
    }
    return views
  }

  return {
    async listStories() {
      const now = new Date().toISOString()
      const { data, error } = await client()
        .from('stories')
        .select(
          'id, author_id, kind, media_path, text, background, caption, created_at, expires_at, profiles!stories_author_id_fkey(username, avatar_url, favourite_anime)',
        )
        .gt('expires_at', now)
        .order('created_at', { ascending: false })
      if (error) notReady(error)
      const rows = (data ?? []) as unknown as StoryRow[]
      const views = await fetchViews()
      const mediaUrls = await signPhotoUrls(rows.map((row) => row.media_path ?? '').filter(Boolean))
      return rows.map((row) => mapStory(row, views, mediaUrls))
    },
    async postPhoto(input) {
      const issue = storyPhotoIssue({ size: input.file.size, type: input.file.type })
      if (issue) throw new Error(issue)
      const captionIssue = storyCaptionIssue(input.caption)
      if (captionIssue) throw new Error(captionIssue)
      const path = `${me.id}/${crypto.randomUUID()}.${imageExtension(input.file.type)}`
      const { error: uploadError } = await client()
        .storage.from('stories')
        .upload(path, input.file, { contentType: input.file.type, upsert: false })
      if (uploadError) throw new Error(uploadError.message)
      const createdAt = new Date().toISOString()
      const { data, error } = await client()
        .from('stories')
        .insert({
          author_id: me.id,
          kind: 'photo',
          media_path: path,
          caption: input.caption.trim().slice(0, STORY_CAPTION_MAX),
          created_at: createdAt,
          expires_at: storyExpiresAt(createdAt),
        })
        .select(
          'id, author_id, kind, media_path, text, background, caption, created_at, expires_at, profiles!stories_author_id_fkey(username, avatar_url, favourite_anime)',
        )
        .single()
      if (error) {
        await client().storage.from('stories').remove([path])
        notReady(error)
      }
      const mediaUrls = await signPhotoUrls([path])
      const created = data as unknown as StoryRow
      return mapStory(created, new Map([[created.id, { count: 0, seen: true }]]), mediaUrls)
    },
    async postText(input) {
      const issue = storyTextIssue(input.text)
      if (issue) throw new Error(issue)
      const createdAt = new Date().toISOString()
      const { data, error } = await client()
        .from('stories')
        .insert({
          author_id: me.id,
          kind: 'text',
          text: input.text.trim().slice(0, STORY_TEXT_MAX),
          background: input.background,
          created_at: createdAt,
          expires_at: storyExpiresAt(createdAt),
        })
        .select(
          'id, author_id, kind, media_path, text, background, caption, created_at, expires_at, profiles!stories_author_id_fkey(username, avatar_url, favourite_anime)',
        )
        .single()
      if (error) notReady(error)
      const created = data as unknown as StoryRow
      return mapStory(created, new Map([[created.id, { count: 0, seen: true }]]), new Map())
    },
    async markViewed(storyId) {
      const { error } = await client()
        .from('story_views')
        .upsert({ story_id: storyId, viewer_id: me.id }, { onConflict: 'story_id,viewer_id' })
      if (error) notReady(error)
    },
    async deleteStory(storyId) {
      // Only the author's own row may be read or deleted, and the stored
      // photo is only removed when a row was actually deleted — otherwise
      // a delete aimed at someone else's story could wipe their media.
      const { data } = await client()
        .from('stories')
        .select('media_path')
        .eq('id', storyId)
        .eq('author_id', me.id)
        .maybeSingle()
      const { data: deleted, error } = await client()
        .from('stories')
        .delete()
        .eq('id', storyId)
        .eq('author_id', me.id)
        .select('id')
      if (error) notReady(error)
      if (!deleted?.length) return
      const mediaPath = (data as { media_path?: string | null } | null)?.media_path
      if (mediaPath) await client().storage.from('stories').remove([mediaPath])
    },
    subscribe(onChange) {
      const supabase = client()
      const channel = supabase
        .channel('stories-feed')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stories' }, () => onChange())
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'stories' }, () => onChange())
        .subscribe()
      return () => {
        void supabase.removeChannel(channel)
      }
    },
  }
}
