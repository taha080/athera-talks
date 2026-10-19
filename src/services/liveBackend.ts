import { normalizeUsername, usernameIssue } from '../lib/auth'
import { getSupabase } from '../lib/supabase'
import type { Conversation, Message, MessageListener, Profile } from '../types'

type ProfileRow = {
  id: string
  username: string
  avatar_url: string | null
  favourite_anime: string | null
}

type MessageRow = {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  created_at: string
  read_at: string | null
}

type ConversationRow = {
  id: string
  updated_at: string
  peer_id: string
  peer_username: string
  peer_avatar_url: string | null
  peer_favourite_anime: string | null
  last_body: string | null
  last_sender_id: string | null
  last_created_at: string | null
  unread: number | string
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
  }
}

export function mapMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
    readAt: row.read_at,
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
    },
    lastMessage:
      row.last_body && row.last_sender_id && row.last_created_at
        ? { body: row.last_body, createdAt: row.last_created_at, senderId: row.last_sender_id }
        : null,
    unread: Number(row.unread) || 0,
  }
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const supabase = client()
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, avatar_url, favourite_anime')
      .eq('id', userId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (data) return mapProfile(data as ProfileRow)
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
    .select('id, username, avatar_url, favourite_anime')
    .single()
  if (error) {
    if (error.code === '23505') throw new Error('That username is taken.')
    throw new Error(error.message)
  }
  return mapProfile(data as ProfileRow)
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
    .select('id, username, avatar_url, favourite_anime')
    .single()
  if (error) throw new Error(error.message)
  return mapProfile(row as ProfileRow)
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
      .select('id, conversation_id, sender_id, body, created_at, read_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(200)
    if (error) throw new Error(error.message)
    return ((data ?? []) as MessageRow[]).map(mapMessage)
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

  async sendMessage(conversationId: string, body: string): Promise<Message> {
    const supabase = client()
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData.user) throw new Error('Sign in first.')
    const text = body.trim()
    if (!text) throw new Error('Write a message first.')
    const { data, error } = await supabase
      .from('messages')
      .insert({ conversation_id: conversationId, sender_id: userData.user.id, body: text })
      .select('id, conversation_id, sender_id, body, created_at, read_at')
      .single()
    if (error) throw new Error(error.message)
    return mapMessage(data as MessageRow)
  },

  async markRead(conversationId: string): Promise<void> {
    const { error } = await client().rpc('mark_conversation_read', { cid: conversationId })
    if (error) throw new Error(error.message)
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
}
