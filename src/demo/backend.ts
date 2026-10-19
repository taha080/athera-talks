import { normalizeUsername, passwordIssue, usernameIssue } from '../lib/auth'
import { parseWallpaper } from '../lib/appearance'
import { messagePreview } from '../lib/messages'
import { parseTheme } from '../lib/theme'
import { encodeWaveform } from '../lib/voice'
import type { Conversation, Message, MessageListener, OutgoingMedia, Profile, ReactionChange, ReplyTarget } from '../types'
import {
  DEMO_EMAIL,
  TAHA_ID,
  buildSeed,
  type DemoAccount,
  type DemoConversation,
  type DemoData,
} from './seed'

const STORAGE_KEY = 'tatalk:demo-data-v1'

export type MemoryStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

type Options = {
  persist?: boolean
  now?: number
  storage?: MemoryStorage
  initial?: DemoData
}

function newId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${prefix}-${Math.random().toString(16).slice(2)}`
}

// Local stand-in for Supabase so the UI can be clicked through with no project.
export function createDemoBackend(options: Options = {}) {
  const persist = options.persist ?? false
  const storage = options.storage
  let data: DemoData = options.initial ?? load(storage) ?? buildSeed(options.now)
  const listeners = new Set<MessageListener>()
  const reactionListeners = new Set<(change: ReactionChange) => void>()
  const typingListeners = new Map<string, Set<(userId: string) => void>>()
  data.hides = data.hides ?? []

  function emitInsert(message: Message) {
    listeners.forEach((listener) => listener.onInsert(message))
  }

  function emitUpdate(message: Message) {
    listeners.forEach((listener) => listener.onUpdate(message))
  }

  function hidden(messageId: string, userId: string): boolean {
    return data.hides.some((hide) => hide.messageId === messageId && hide.userId === userId)
  }

  function save() {
    if (!persist || !storage) return
    storage.setItem(STORAGE_KEY, JSON.stringify(data))
  }

  function requireUser(): string {
    if (!data.currentUserId) throw new Error('Sign in first.')
    return data.currentUserId
  }

  function profileById(id: string): Profile | null {
    return data.profiles.find((profile) => profile.id === id) ?? null
  }

  function accountByEmail(email: string): DemoAccount | undefined {
    return data.accounts.find((account) => account.email === email.trim().toLowerCase())
  }

  function conversationList(): Conversation[] {
    const me = requireUser()
    return data.conversations
      .filter((conversation) => conversation.memberIds.includes(me))
      .map((conversation) => toConversation(conversation, me))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  }

  function toConversation(conversation: DemoConversation, me: string): Conversation {
    const peerId = conversation.memberIds.find((id) => id !== me) ?? conversation.memberIds[0]
    const peer = profileById(peerId)
    const thread = data.messages
      .filter((message) => message.conversationId === conversation.id && !hidden(message.id, me))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    const last = thread.at(-1) ?? null
    const unread = thread.filter((message) => message.senderId !== me && !message.readAt && !message.deletedAt).length
    return {
      id: conversation.id,
      updatedAt: conversation.updatedAt,
      peer: peer ?? { id: peerId, username: 'fan', avatarUrl: null, favouriteAnime: null },
      lastMessage: last
        ? {
            body: messagePreview(last),
            createdAt: last.createdAt,
            senderId: last.senderId,
            readAt: last.readAt,
            deliveredAt: last.deliveredAt ?? null,
          }
        : null,
      unread,
    }
  }

  return {
    currentProfile(): Profile | null {
      if (!data.currentUserId) return null
      return profileById(data.currentUserId)
    },

    currentEmail(): string | null {
      if (!data.currentUserId) return null
      return data.accounts.find((account) => account.profileId === data.currentUserId)?.email ?? null
    },

    usernameAvailable(username: string): boolean {
      const issue = usernameIssue(username)
      if (issue) return false
      const name = normalizeUsername(username)
      const mine = data.currentUserId
      return !data.profiles.some((profile) => profile.username === name && profile.id !== mine)
    },

    async signIn(email: string, password: string): Promise<Profile> {
      const account = accountByEmail(email)
      if (!account || account.password !== password) {
        throw new Error('That email and password do not match. Demo fan: taha@tatalk.app / tatalk1')
      }
      data.currentUserId = account.profileId
      save()
      const profile = profileById(account.profileId)
      if (!profile) throw new Error('That demo profile is missing.')
      return profile
    },

    async signUp(input: { email: string; password: string; username: string }): Promise<Profile> {
      const email = input.email.trim().toLowerCase()
      const username = normalizeUsername(input.username)
      const nameError = usernameIssue(username)
      if (nameError) throw new Error(nameError)
      const passError = passwordIssue(input.password)
      if (passError) throw new Error(passError)
      if (!this.usernameAvailable(username)) throw new Error('That username is taken.')
      if (accountByEmail(email)) throw new Error('That email is already in the demo.')

      const profile: Profile = {
        id: newId('fan'),
        username,
        avatarUrl: null,
        favouriteAnime: null,
      }
      data.profiles.push(profile)
      data.accounts.push({ email, password: input.password, profileId: profile.id })
      data.currentUserId = profile.id
      save()
      return profile
    },

    // The demo has one linked Google account: Taha.
    async signInWithGoogle(): Promise<Profile> {
      const account = accountByEmail(DEMO_EMAIL)
      if (!account) throw new Error('The demo Google account is missing. Reset demo data.')
      data.currentUserId = account.profileId
      save()
      const profile = profileById(account.profileId)
      if (!profile) throw new Error('The demo Google account is missing.')
      return profile
    },

    requestPasswordReset(email: string): { found: boolean } {
      return { found: Boolean(accountByEmail(email)) }
    },

    resetPassword(email: string, password: string) {
      const issue = passwordIssue(password)
      if (issue) throw new Error(issue)
      const account = accountByEmail(email)
      if (!account) throw new Error('No demo account uses that email.')
      account.password = password
      save()
    },

    signOut() {
      data.currentUserId = null
      save()
    },

    async saveProfile(patch: { username: string; favouriteAnime: string | null }): Promise<Profile> {
      const me = requireUser()
      const username = normalizeUsername(patch.username)
      const issue = usernameIssue(username)
      if (issue) throw new Error(issue)
      if (!this.usernameAvailable(username)) throw new Error('That username is taken.')
      const profile = profileById(me)
      if (!profile) throw new Error('Profile missing.')
      profile.username = username
      profile.favouriteAnime = patch.favouriteAnime
      save()
      return { ...profile }
    },

    async savePreferences(patch: {
      theme?: string
      wallpaper?: string
      showLastSeen?: boolean
      showReadReceipts?: boolean
      notifySound?: boolean
      notifyDesktop?: boolean
    }): Promise<Profile> {
      const me = requireUser()
      const profile = profileById(me)
      if (!profile) throw new Error('Profile missing.')
      if (patch.theme) profile.theme = parseTheme(patch.theme)
      if (patch.wallpaper) profile.wallpaper = parseWallpaper(patch.wallpaper)
      if (patch.showLastSeen !== undefined) profile.showLastSeen = patch.showLastSeen
      if (patch.showReadReceipts !== undefined) profile.showReadReceipts = patch.showReadReceipts
      if (patch.notifySound !== undefined) profile.notifySound = patch.notifySound
      if (patch.notifyDesktop !== undefined) profile.notifyDesktop = patch.notifyDesktop
      save()
      return { ...profile }
    },

    async uploadAvatar(dataUrl: string): Promise<Profile> {
      const me = requireUser()
      const profile = profileById(me)
      if (!profile) throw new Error('Profile missing.')
      profile.avatarUrl = dataUrl
      save()
      return { ...profile }
    },

    async uploadWallpaper(dataUrl: string): Promise<Profile> {
      const me = requireUser()
      const profile = profileById(me)
      if (!profile) throw new Error('Profile missing.')
      profile.wallpaper = 'custom'
      profile.wallpaperUrl = dataUrl
      profile.wallpaperPath = 'demo'
      save()
      return { ...profile }
    },

    async clearWallpaper(): Promise<Profile> {
      const me = requireUser()
      const profile = profileById(me)
      if (!profile) throw new Error('Profile missing.')
      profile.wallpaper = 'plain'
      profile.wallpaperUrl = null
      profile.wallpaperPath = null
      save()
      return { ...profile }
    },

    async listConversations(): Promise<Conversation[]> {
      return conversationList()
    },

    async listMessages(conversationId: string): Promise<Message[]> {
      const me = requireUser()
      const conversation = data.conversations.find((item) => item.id === conversationId)
      if (!conversation || !conversation.memberIds.includes(me)) {
        throw new Error('That chat is not yours.')
      }
      return data.messages
        .filter((message) => message.conversationId === conversationId && !hidden(message.id, me))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((message) => ({ ...message, reactions: message.reactions ? message.reactions.map((item) => ({ ...item })) : [] }))
    },

    async searchUsers(query: string): Promise<Profile[]> {
      const me = requireUser()
      const needle = query.trim().toLowerCase()
      if (!needle) return []
      return data.profiles
        .filter((profile) => profile.id !== me && profile.username.includes(needle))
        .slice(0, 20)
        .map((profile) => ({ ...profile }))
    },

    async startConversation(otherUserId: string): Promise<string> {
      const me = requireUser()
      if (otherUserId === me) throw new Error('You cannot start a chat with yourself.')
      if (!profileById(otherUserId)) throw new Error('User not found.')
      const existing = data.conversations.find((conversation) => {
        const members = conversation.memberIds
        return members.includes(me) && members.includes(otherUserId) && members.length === 2
      })
      if (existing) return existing.id
      const id = newId('chat')
      data.conversations.unshift({
        id,
        memberIds: [me, otherUserId],
        updatedAt: new Date().toISOString(),
      })
      save()
      return id
    },

    async sendMessage(conversationId: string, body: string, reply?: ReplyTarget | null): Promise<Message> {
      const me = requireUser()
      const conversation = data.conversations.find((item) => item.id === conversationId)
      if (!conversation || !conversation.memberIds.includes(me)) {
        throw new Error('That chat is not yours.')
      }
      const text = body.trim()
      if (!text) throw new Error('Write a message first.')
      const message: Message = {
        id: newId('msg'),
        conversationId,
        senderId: me,
        body: text,
        createdAt: new Date().toISOString(),
        readAt: null,
        kind: 'text',
        deliveredAt: null,
        replyTo: reply?.id ?? null,
        replyPreview: reply?.preview ?? null,
        deletedAt: null,
      }
      data.messages.push(message)
      conversation.updatedAt = message.createdAt
      save()
      emitInsert(message)
      return message
    },

    async sendMedia(input: OutgoingMedia): Promise<Message> {
      const me = requireUser()
      const conversation = data.conversations.find((item) => item.id === input.conversationId)
      if (!conversation || !conversation.memberIds.includes(me)) {
        throw new Error('That chat is not yours.')
      }
      let mediaUrl: string | null = null
      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        mediaUrl = URL.createObjectURL(input.file)
      }
      const message: Message = {
        id: newId('msg'),
        conversationId: input.conversationId,
        senderId: me,
        body: input.kind === 'voice' ? 'Voice message' : 'Photo',
        createdAt: new Date().toISOString(),
        readAt: null,
        kind: input.kind,
        deliveredAt: null,
        mediaPath: 'demo',
        mediaUrl,
        mediaMime: input.mime,
        mediaSeconds: input.seconds ?? null,
        waveform: input.waveform ?? null,
        replyTo: input.reply?.id ?? null,
        replyPreview: input.reply?.preview ?? null,
        deletedAt: null,
      }
      data.messages.push(message)
      conversation.updatedAt = message.createdAt
      save()
      emitInsert({ ...message, waveform: message.waveform ? encodeWaveform(message.waveform).split(',').map(Number) : null })
      return message
    },

    async hideMessage(messageId: string): Promise<void> {
      const me = requireUser()
      if (!data.hides.some((hide) => hide.messageId === messageId && hide.userId === me)) {
        data.hides.push({ messageId, userId: me })
      }
      save()
    },

    async deleteForEveryone(message: Pick<Message, 'id' | 'kind' | 'mediaPath'>): Promise<void> {
      const me = requireUser()
      const stored = data.messages.find((item) => item.id === message.id && item.senderId === me)
      if (!stored || stored.deletedAt) throw new Error('Message not found')
      stored.deletedAt = new Date().toISOString()
      stored.body = ''
      stored.mediaPath = null
      stored.mediaUrl = null
      stored.mediaMime = null
      stored.waveform = null
      save()
      emitUpdate({ ...stored })
    },

    async markRead(conversationId: string): Promise<void> {
      const me = requireUser()
      const stamp = new Date().toISOString()
      data.messages.forEach((message) => {
        if (message.conversationId === conversationId && message.senderId !== me && !message.readAt) {
          message.readAt = stamp
          message.deliveredAt = message.deliveredAt ?? stamp
          emitUpdate({ ...message })
        }
      })
      save()
    },

    async markDelivered(): Promise<void> {
      const me = requireUser()
      const stamp = new Date().toISOString()
      data.messages.forEach((message) => {
        const conversation = data.conversations.find((item) => item.id === message.conversationId)
        if (!conversation?.memberIds.includes(me) || message.senderId === me || message.deliveredAt) return
        message.deliveredAt = stamp
        emitUpdate({ ...message })
      })
      save()
    },

    async touchPresence(): Promise<void> {
      const me = requireUser()
      const profile = profileById(me)
      if (profile) profile.lastSeenAt = new Date().toISOString()
      save()
    },

    async attachMedia(message: Message): Promise<Message> {
      return message
    },

    async toggleReaction(messageId: string, emoji: string): Promise<ReactionChange> {
      const me = requireUser()
      const message = data.messages.find((item) => item.id === messageId)
      if (!message || hidden(message.id, me)) throw new Error('Message not found')
      const reactions = message.reactions ?? []
      const mine = reactions.find((item) => item.userId === me)
      const removed = mine?.emoji === emoji
      message.reactions = removed
        ? reactions.filter((item) => item.userId !== me)
        : [...reactions.filter((item) => item.userId !== me), { userId: me, emoji }]
      save()
      const change = { messageId, userId: me, emoji, removed }
      reactionListeners.forEach((listener) => listener(change))
      return change
    },

    subscribeReactions(onChange: (change: ReactionChange) => void): () => void {
      reactionListeners.add(onChange)
      return () => reactionListeners.delete(onChange)
    },

    subscribe(listener: MessageListener): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    subscribeTyping(conversationId: string, onTyping: (userId: string) => void): () => void {
      const set = typingListeners.get(conversationId) ?? new Set()
      set.add(onTyping)
      typingListeners.set(conversationId, set)
      return () => set.delete(onTyping)
    },

    async broadcastTyping(conversationId: string): Promise<void> {
      const me = requireUser()
      typingListeners.get(conversationId)?.forEach((listener) => listener(me))
    },

    reset() {
      const signedIn = data.currentUserId === TAHA_ID || data.currentUserId === null
      data = buildSeed()
      data.currentUserId = signedIn && data.currentUserId === null ? TAHA_ID : data.currentUserId
      // Keep the visitor signed in as Taha after a reset of the sample circle.
      if (data.accounts.some((account) => account.profileId === TAHA_ID)) {
        data.currentUserId = TAHA_ID
      }
      save()
    },
  }
}

export type DemoBackend = ReturnType<typeof createDemoBackend>

function load(storage: MemoryStorage | undefined): DemoData | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DemoData
    if (parsed.version !== 1 || !Array.isArray(parsed.profiles)) return null
    parsed.hides = parsed.hides ?? []
    return parsed
  } catch {
    return null
  }
}

function browserStorage(): MemoryStorage | undefined {
  if (typeof localStorage === 'undefined') return undefined
  return localStorage
}

export const demoBackend = createDemoBackend({
  persist: true,
  storage: browserStorage(),
})
