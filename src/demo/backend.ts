import { normalizeUsername, passwordIssue, usernameIssue } from '../lib/auth'
import type { Conversation, Message, MessageListener, Profile } from '../types'
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

  function emitInsert(message: Message) {
    listeners.forEach((listener) => listener.onInsert(message))
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
      .filter((message) => message.conversationId === conversation.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    const last = thread.at(-1) ?? null
    const unread = thread.filter((message) => message.senderId !== me && !message.readAt).length
    return {
      id: conversation.id,
      updatedAt: conversation.updatedAt,
      peer: peer ?? { id: peerId, username: 'fan', avatarUrl: null, favouriteAnime: null },
      lastMessage: last
        ? { body: last.body, createdAt: last.createdAt, senderId: last.senderId }
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

    async uploadAvatar(dataUrl: string): Promise<Profile> {
      const me = requireUser()
      const profile = profileById(me)
      if (!profile) throw new Error('Profile missing.')
      profile.avatarUrl = dataUrl
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
        .filter((message) => message.conversationId === conversationId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((message) => ({ ...message }))
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

    async sendMessage(conversationId: string, body: string): Promise<Message> {
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
      }
      data.messages.push(message)
      conversation.updatedAt = message.createdAt
      save()
      emitInsert(message)
      return message
    },

    async markRead(conversationId: string): Promise<void> {
      const me = requireUser()
      const stamp = new Date().toISOString()
      data.messages.forEach((message) => {
        if (message.conversationId === conversationId && message.senderId !== me && !message.readAt) {
          message.readAt = stamp
        }
      })
      save()
    },

    subscribe(listener: MessageListener): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
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
