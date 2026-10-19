import { normalizeUsername, usernameIssue } from '../lib/auth'
import { parseWallpaper } from '../lib/appearance'
import { baseMime, mediaBucket } from '../lib/media'
import { messageKind } from '../lib/messages'
import { parseTheme } from '../lib/theme'
import { encodeWaveform, extensionForMime, parseWaveform } from '../lib/voice'
import { getSupabase } from '../lib/supabase'
import type { Conversation, Message, MessageListener, OutgoingMedia, Profile, ReplyTarget } from '../types'

const PROFILE_COLUMNS =
  'id, username, avatar_url, favourite_anime, theme, wallpaper, wallpaper_path, last_seen_at, show_last_seen, show_read_receipts, notify_sound, notify_desktop'

const MESSAGE_COLUMNS =
  'id, conversation_id, sender_id, body, created_at, read_at, kind, media_path, media_mime, media_seconds, waveform, reply_to, reply_preview, deleted_at, delivered_at'

type ProfileRow = {
  id: string
  username: string
  avatar_url: string | null
  favourite_anime: string | null
  theme?: string | null
  wallpaper?: string | null
  wallpaper_path?: string | null
  last_seen_at?: string | null
  show_last_seen?: boolean | null
  show_read_receipts?: boolean | null
  notify_sound?: boolean | null
  notify_desktop?: boolean | null
}

type MessageRow = {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  created_at: string
  read_at: string | null
  kind?: string | null
  media_path?: string | null
  media_mime?: string | null
  media_seconds?: number | null
  waveform?: string | null
  reply_to?: string | null
  reply_preview?: string | null
  deleted_at?: string | null
  delivered_at?: string | null
}

type ConversationRow = {
  id: string
  updated_at: string
  peer_id: string
  peer_username: string
  peer_avatar_url: string | null
  peer_favourite_anime: string | null
  peer_last_seen?: string | null
  peer_receipts?: boolean | null
  last_body: string | null
  last_kind?: string | null
  last_sender_id: string | null
  last_created_at: string | null
  unread: number | string
}

export type PreferencePatch = {
  theme?: string
  wallpaper?: string
  showLastSeen?: boolean
  showReadReceipts?: boolean
  notifySound?: boolean
  notifyDesktop?: boolean
}

function client() {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export function mapProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    username: row.username,
    avatarUrl: row.avatar_url,
    favouriteAnime: row.favourite_anime,
    theme: row.theme ? parseTheme(row.theme) : undefined,
    wallpaper: row.wallpaper ? parseWallpaper(row.wallpaper) : undefined,
    wallpaperPath: row.wallpaper_path ?? null,
    lastSeenAt: row.last_seen_at ?? null,
    showLastSeen: row.show_last_seen ?? true,
    showReadReceipts: row.show_read_receipts ?? true,
    notifySound: row.notify_sound ?? true,
    notifyDesktop: row.notify_desktop ?? true,
  }
}

export function mapMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body ?? '',
    createdAt: row.created_at,
    readAt: row.read_at,
    kind: messageKind(row.kind),
    deliveredAt: row.delivered_at ?? null,
    mediaPath: row.media_path ?? null,
    mediaMime: row.media_mime ?? null,
    mediaSeconds: row.media_seconds ?? null,
    waveform: parseWaveform(row.waveform),
    replyTo: row.reply_to ?? null,
    replyPreview: row.reply_preview ?? null,
    deletedAt: row.deleted_at ?? null,
  }
}

function mapConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    updatedAt: row.updated_at,
    peer: {
      id: row.peer_id,
      username: row.peer_username,
      avatarUrl: row.peer_avatar_url,
      favouriteAnime: row.peer_favourite_anime,
      lastSeenAt: row.peer_last_seen ?? null,
      showReadReceipts: row.peer_receipts ?? true,
    },
    lastMessage:
      row.last_body && row.last_sender_id && row.last_created_at
        ? {
            body: row.last_body,
            createdAt: row.last_created_at,
            senderId: row.last_sender_id,
          }
        : null,
    unread: Number(row.unread) || 0,
  }
}

async function withWallpaper(profile: Profile): Promise<Profile> {
  if (profile.wallpaper !== 'custom' || !profile.wallpaperPath) return profile
  const { data, error } = await client().storage.from('wallpapers').createSignedUrl(profile.wallpaperPath, 60 * 60 * 24 * 7)
  if (error || !data?.signedUrl) return profile
  return { ...profile, wallpaperUrl: data.signedUrl }
}

async function signMessages(messages: Message[]): Promise<Message[]> {
  const supabase = client()
  const next = messages.map((message) => ({ ...message }))
  for (const kind of ['voice', 'image'] as const) {
    const bucket = mediaBucket(kind)
    const indexes = next
      .map((message, index) => ({ message, index }))
      .filter(({ message }) => message.kind === kind && message.mediaPath && !message.deletedAt)
    if (indexes.length === 0) continue
    const { data, error } = await supabase.storage.from(bucket).createSignedUrls(
      indexes.map(({ message }) => message.mediaPath as string),
      60 * 60,
    )
    if (error || !data) continue
    data.forEach((item, index) => {
      const target = indexes[index]
      if (target && item?.signedUrl) next[target.index] = { ...next[target.index], mediaUrl: item.signedUrl }
    })
  }
  return next
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const supabase = client()
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle()
    if (error) throw new Error(error.message)
    if (data) return withWallpaper(mapProfile(data as ProfileRow))
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  return null
}

export async function usernameAvailable(name: string): Promise<boolean> {
  const { data, error } = await client().rpc('username_available', { name: normalizeUsername(name) })
  if (error) throw new Error(error.message)
  return Boolean(data)
}

export async function saveProfile(
  userId: string,
  patch: { username: string; favouriteAnime: string | null },
): Promise<Profile> {
  const username = normalizeUsername(patch.username)
  const issue = usernameIssue(username)
  if (issue) throw new Error(issue)
  const { data, error } = await client()
    .from('profiles')
    .update({ username, favourite_anime: patch.favouriteAnime })
    .eq('id', userId)
    .select(PROFILE_COLUMNS)
    .single()
  if (error) {
    if (error.code === '23505') throw new Error('That username is taken.')
    throw new Error(error.message)
  }
  return withWallpaper(mapProfile(data as ProfileRow))
}

export async function savePreferences(userId: string, patch: PreferencePatch): Promise<Profile> {
  const update: Record<string, string | boolean> = {}
  if (patch.theme) update.theme = parseTheme(patch.theme)
  if (patch.wallpaper) update.wallpaper = parseWallpaper(patch.wallpaper)
  if (patch.showLastSeen !== undefined) update.show_last_seen = patch.showLastSeen
  if (patch.showReadReceipts !== undefined) update.show_read_receipts = patch.showReadReceipts
  if (patch.notifySound !== undefined) update.notify_sound = patch.notifySound
  if (patch.notifyDesktop !== undefined) update.notify_desktop = patch.notifyDesktop
  const { data, error } = await client().from('profiles').update(update).eq('id', userId).select(PROFILE_COLUMNS).single()
  if (error) throw new Error(error.message)
  return withWallpaper(mapProfile(data as ProfileRow))
}

export async function uploadAvatar(userId: string, blob: Blob): Promise<Profile> {
  const supabase = client()
  const path = `${userId}/avatar.jpg`
  const { error: uploadError } = await supabase.storage.from('avatars').upload(path, blob, {
    upsert: true,
    contentType: 'image/jpeg',
  })
  if (uploadError) throw new Error(uploadError.message)
  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  const publicUrl = `${data.publicUrl}?v=${Date.now()}`
  const { data: row, error } = await supabase
    .from('profiles')
    .update({ avatar_url: publicUrl })
    .eq('id', userId)
    .select(PROFILE_COLUMNS)
    .single()
  if (error) throw new Error(error.message)
  return withWallpaper(mapProfile(row as ProfileRow))
}

export async function uploadWallpaper(userId: string, blob: Blob): Promise<Profile> {
  const supabase = client()
  const path = `${userId}/wallpaper.jpg`
  const { error: uploadError } = await supabase.storage.from('wallpapers').upload(path, blob, {
    upsert: true,
    contentType: 'image/jpeg',
  })
  if (uploadError) throw new Error(uploadError.message)
  const { data: row, error } = await supabase
    .from('profiles')
    .update({ wallpaper: 'custom', wallpaper_path: path })
    .eq('id', userId)
    .select(PROFILE_COLUMNS)
    .single()
  if (error) throw new Error(error.message)
  return withWallpaper(mapProfile(row as ProfileRow))
}

export async function clearWallpaper(userId: string): Promise<Profile> {
  const supabase = client()
  await supabase.storage.from('wallpapers').remove([`${userId}/wallpaper.jpg`])
  const { data, error } = await supabase
    .from('profiles')
    .update({ wallpaper: 'plain', wallpaper_path: null })
    .eq('id', userId)
    .select(PROFILE_COLUMNS)
    .single()
  if (error) throw new Error(error.message)
  return mapProfile(data as ProfileRow)
}

let cachedUserId: string | null = null

async function currentUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId
  const { data, error } = await client().auth.getUser()
  if (error || !data.user) throw new Error('Sign in first.')
  cachedUserId = data.user.id
  return data.user.id
}

export const liveChat = {
  async listConversations(): Promise<Conversation[]> {
    const { data, error } = await client().rpc('list_my_conversations')
    if (error) throw new Error(error.message)
    return ((data ?? []) as ConversationRow[]).map(mapConversation)
  },

  async listMessages(conversationId: string): Promise<Message[]> {
    const { data, error } = await client()
      .from('messages')
      .select(MESSAGE_COLUMNS)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(200)
    if (error) throw new Error(error.message)
    return signMessages(((data ?? []) as MessageRow[]).map(mapMessage))
  },

  async searchUsers(query: string): Promise<Profile[]> {
    const { data, error } = await client().rpc('search_profiles', { query })
    if (error) throw new Error(error.message)
    return ((data ?? []) as ProfileRow[]).map(mapProfile)
  },

  async startConversation(otherUserId: string): Promise<string> {
    const { data, error } = await client().rpc('start_direct_conversation', { other_id: otherUserId })
    if (error) throw new Error(error.message)
    return String(data)
  },

  async sendMessage(conversationId: string, body: string, reply?: ReplyTarget | null): Promise<Message> {
    const supabase = client()
    const userId = await currentUserId()
    const text = body.trim()
    if (!text) throw new Error('Write a message first.')
    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: userId,
        body: text,
        kind: 'text',
        reply_to: reply?.id ?? null,
        reply_preview: reply?.preview ?? null,
      })
      .select(MESSAGE_COLUMNS)
      .single()
    if (error) throw new Error(error.message)
    return mapMessage(data as MessageRow)
  },

  async sendMedia(input: OutgoingMedia): Promise<Message> {
    const supabase = client()
    const userId = await currentUserId()
    const bucket = mediaBucket(input.kind)
    const mime = baseMime(input.mime || (input.kind === 'image' ? 'image/jpeg' : 'audio/webm'))
    const ext = input.kind === 'image' ? 'jpg' : extensionForMime(mime)
    const path = `${input.conversationId}/${userId}/${crypto.randomUUID()}.${ext}`
    const { error: uploadError } = await supabase.storage.from(bucket).upload(path, input.file, {
      contentType: mime,
      upsert: false,
    })
    if (uploadError) throw new Error(uploadError.message)
    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: input.conversationId,
        sender_id: userId,
        body: input.kind === 'voice' ? 'Voice message' : 'Photo',
        kind: input.kind,
        media_path: path,
        media_mime: mime,
        media_seconds: input.seconds ?? null,
        waveform: input.waveform ? encodeWaveform(input.waveform) : null,
        reply_to: input.reply?.id ?? null,
        reply_preview: input.reply?.preview ?? null,
      })
      .select(MESSAGE_COLUMNS)
      .single()
    if (error) throw new Error(error.message)
    const [signed] = await signMessages([mapMessage(data as MessageRow)])
    return signed
  },

  async hideMessage(messageId: string): Promise<void> {
    const { error } = await client().rpc('hide_message', { mid: messageId })
    if (error) throw new Error(error.message)
  },

  async deleteForEveryone(message: Pick<Message, 'id' | 'kind' | 'mediaPath'>): Promise<void> {
    const { data, error } = await client().rpc('delete_message_for_everyone', { mid: message.id })
    if (error) throw new Error(error.message)
    const path = (typeof data === 'string' && data) || message.mediaPath
    if (path && (message.kind === 'voice' || message.kind === 'image')) {
      await client().storage.from(mediaBucket(message.kind)).remove([path])
    }
  },

  async markRead(conversationId: string): Promise<void> {
    const { error } = await client().rpc('mark_conversation_read', { cid: conversationId })
    if (error) throw new Error(error.message)
  },

  async markDelivered(): Promise<void> {
    const { error } = await client().rpc('mark_delivered')
    if (error) throw new Error(error.message)
  },

  async touchPresence(): Promise<void> {
    const { error } = await client().rpc('touch_last_seen')
    if (error) throw new Error(error.message)
  },

  async attachMedia(message: Message): Promise<Message> {
    if (!message.mediaPath || message.mediaUrl || message.deletedAt) return message
    if (message.kind !== 'voice' && message.kind !== 'image') return message
    const [signed] = await signMessages([message])
    return signed
  },

  subscribe(listener: MessageListener): () => void {
    const supabase = client()
    const channel = supabase
      .channel('messages-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        listener.onInsert(mapMessage(payload.new as MessageRow))
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => {
        listener.onUpdate(mapMessage(payload.new as MessageRow))
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  },

  subscribeTyping(conversationId: string, onTyping: (userId: string) => void): () => void {
    const supabase = client()
    const channel = supabase.channel(`room:${conversationId}`)
    channel.on('broadcast', { event: 'typing' }, ({ payload }) => {
      const userId = payload && typeof payload === 'object' && 'userId' in payload ? String(payload.userId) : ''
      if (userId) onTyping(userId)
    })
    void channel.subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  },

  async broadcastTyping(conversationId: string): Promise<void> {
    const userId = await currentUserId()
    const channel = client().channel(`room:${conversationId}`)
    await channel.send({ type: 'broadcast', event: 'typing', payload: { userId } })
  },
}
