import { normalizeUsername, passwordIssue, usernameIssue } from '../lib/auth'
import { parseWallpaper } from '../lib/appearance'
import { messagePreview } from '../lib/messages'
import { parseTheme } from '../lib/theme'
import { encodeWaveform } from '../lib/voice'
import { byChatOrder, REPORT_REASONS } from '../lib/chatList'
import type { BlockedPerson, CallLog, ChatPrefPatch, ContactRequest, Conversation, GroupMember, Message, MessageListener, OutgoingMedia, Profile, ReactionChange, ReplyTarget, SearchPerson, UserReport } from '../types'
import {
  DEMO_EMAIL,
  TAHA_ID,
  buildSeed,
  type DemoAccount,
  type DemoConversation,
  type DemoData,
  type DemoPref,
  type DemoRequest,
} from './seed'

const STORAGE_KEY = 'tatalk:demo-data-v1'

function grandfatherRequests(data: DemoData): DemoRequest[] {
  return data.conversations.flatMap((conversation) => {
    if ((conversation.kind ?? 'direct') !== 'direct' || conversation.memberIds.length !== 2) return []
    const [left, right] = conversation.memberIds
    const fromId = left < right ? left : right
    const toId = left < right ? right : left
    return [{
      id: `req-${conversation.id}`,
      fromId,
      toId,
      status: 'accepted' as const,
      createdAt: conversation.updatedAt,
      updatedAt: conversation.updatedAt,
    }]
  })
}

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
  const requestListeners = new Set<() => void>()
  data.requests = data.requests ?? grandfatherRequests(data)
  data.hides = data.hides ?? []
  data.blocks = data.blocks ?? []
  data.reports = data.reports ?? []
  data.prefs = data.prefs ?? []
  data.calls = data.calls ?? []
  const callListeners = new Set<(call: CallLog) => void>()
  const typingListeners = new Map<string, Set<(userId: string) => void>>()

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

  function requestBetween(a: string, b: string): DemoRequest | undefined {
    return (data.requests ?? []).find((request) => {
      const left = request.fromId < request.toId ? request.fromId : request.toId
      const right = request.fromId < request.toId ? request.toId : request.fromId
      const wantLeft = a < b ? a : b
      const wantRight = a < b ? b : a
      return left === wantLeft && right === wantRight
    })
  }

  function areContacts(a: string, b: string): boolean {
    return requestBetween(a, b)?.status === 'accepted'
  }

  function isBlocked(a: string, b: string): boolean {
    return (data.blocks ?? []).some(
      (block) =>
        (block.blockerId === a && block.blockedId === b) || (block.blockerId === b && block.blockedId === a),
    )
  }

  function blockedByMe(me: string, other: string): boolean {
    return (data.blocks ?? []).some((block) => block.blockerId === me && block.blockedId === other)
  }

  function prefFor(userId: string, conversationId: string): DemoPref | undefined {
    return (data.prefs ?? []).find((pref) => pref.userId === userId && pref.conversationId === conversationId)
  }

  function unarchiveOnMessage(conversationId: string) {
    for (const pref of data.prefs ?? []) {
      if (pref.conversationId === conversationId && pref.archived && !pref.muted) pref.archived = false
    }
  }

  function assertCanSend(conversation: DemoConversation, me: string) {
    if (!conversation.memberIds.includes(me)) throw new Error('That chat is not yours.')
    if ((conversation.kind ?? 'direct') === 'group') return
    const peerId = conversation.memberIds.find((id) => id !== me)
    if (!peerId || !areContacts(me, peerId)) throw new Error('You can only message an accepted contact.')
    if (isBlocked(me, peerId)) throw new Error('This chat is blocked.')
  }

  function requireGroup(conversationId: string, me: string): DemoConversation {
    const conversation = data.conversations.find((item) => item.id === conversationId)
    if (!conversation || (conversation.kind ?? 'direct') !== 'group' || !conversation.memberIds.includes(me)) {
      throw new Error('That group was not found.')
    }
    return conversation
  }

  function requireAdmin(conversation: DemoConversation, me: string) {
    if ((conversation.roles?.[me] ?? 'member') !== 'admin') throw new Error('Only an admin can do that.')
  }

  function toContactRequest(request: DemoRequest, me: string): ContactRequest {
    const peerId = request.fromId === me ? request.toId : request.fromId
    const peer = profileById(peerId) ?? { id: peerId, username: 'fan', avatarUrl: null, favouriteAnime: null }
    return {
      id: request.id,
      fromId: request.fromId,
      toId: request.toId,
      status: request.status,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      peer,
    }
  }

  function accountByEmail(email: string): DemoAccount | undefined {
    return data.accounts.find((account) => account.email === email.trim().toLowerCase())
  }

  function conversationList(): Conversation[] {
    const me = requireUser()
    return data.conversations
      .filter((conversation) => {
        if (!conversation.memberIds.includes(me)) return false
        if ((conversation.kind ?? 'direct') === 'group') return true
        const peerId = conversation.memberIds.find((id) => id !== me)
        return Boolean(peerId && areContacts(me, peerId))
      })
      .map((conversation) => toConversation(conversation, me))
      .sort(byChatOrder)
  }

  function receiptsVisible(me: string, conversation: DemoConversation): boolean {
    if ((conversation.kind ?? 'direct') === 'group') return true
    if (profileById(me)?.isCreator) return true
    const peerId = conversation.memberIds.find((id) => id !== me)
    const peer = peerId ? profileById(peerId) : undefined
    return peer?.showReadReceipts !== false
  }

  function presentMessage(message: Message, visible: boolean): Message {
    const copy: Message = {
      ...message,
      reactions: message.reactions ? message.reactions.map((item) => ({ ...item })) : [],
    }
    if (visible) return copy
    return { ...copy, readAt: null, deliveredAt: null }
  }

  function toConversation(conversation: DemoConversation, me: string): Conversation {
    const peerId = conversation.memberIds.find((id) => id !== me) ?? conversation.memberIds[0]
    const peer = profileById(peerId) ?? { id: peerId, username: 'fan', avatarUrl: null, favouriteAnime: null }
    const thread = data.messages
      .filter((message) => message.conversationId === conversation.id && !hidden(message.id, me))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    const last = thread.at(-1) ?? null
    const unread = thread.filter((message) => message.senderId !== me && !message.readAt && !message.deletedAt).length
    const group = (conversation.kind ?? 'direct') === 'group'
    const seeReceipts = receiptsVisible(me, conversation)
    const seePresence = profileById(me)?.isCreator === true || peer.showLastSeen !== false
    const pref = prefFor(me, conversation.id)
    return {
      id: conversation.id,
      updatedAt: conversation.updatedAt,
      kind: group ? 'group' : 'direct',
      title: group ? conversation.title ?? 'Group' : null,
      photoUrl: group ? conversation.photoUrl ?? null : null,
      memberCount: conversation.memberIds.length,
      myRole: conversation.roles?.[me] ?? 'member',
      pinned: pref?.pinned ?? false,
      muted: pref?.muted ?? false,
      archived: pref?.archived ?? false,
      blocked: !group && Boolean(peerId && isBlocked(me, peerId)),
      blockedByMe: !group && Boolean(peerId && blockedByMe(me, peerId)),
      peer: group
        ? {
            id: conversation.id,
            username: conversation.title ?? 'Group',
            avatarUrl: conversation.photoUrl ?? null,
            favouriteAnime: null,
            isCreator: false,
            showReadReceipts: true,
          }
        : {
            ...peer,
            lastSeenAt: seePresence ? peer.lastSeenAt ?? null : null,
            showReadReceipts: seeReceipts,
          },
      lastMessage: last
        ? {
            body: messagePreview(last),
            createdAt: last.createdAt,
            senderId: last.senderId,
            readAt: seeReceipts ? last.readAt ?? null : null,
            deliveredAt: seeReceipts ? last.deliveredAt ?? null : null,
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
      const visible = receiptsVisible(me, conversation)
      return data.messages
        .filter((message) => message.conversationId === conversationId && !hidden(message.id, me))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((message) => presentMessage(message, visible))
    },

    async listCalls(conversationId: string): Promise<CallLog[]> {
      const me = requireUser()
      const conversation = data.conversations.find((item) => item.id === conversationId)
      if (!conversation || !conversation.memberIds.includes(me)) return []
      return (data.calls ?? [])
        .filter((call) => call.conversationId === conversationId)
        .sort((a, b) => a.endedAt.localeCompare(b.endedAt))
    },

    async logCall(input: Omit<CallLog, 'id'>): Promise<CallLog> {
      const me = requireUser()
      const conversation = data.conversations.find((item) => item.id === input.conversationId)
      if (!conversation || !conversation.memberIds.includes(me)) throw new Error('That chat is not yours.')
      if (input.callerId !== me && input.calleeId !== me) throw new Error('Only people on the call can log it.')
      const existing = input.clientId
        ? (data.calls ?? []).find((call) => call.clientId === input.clientId)
        : undefined
      if (existing) return existing
      const call: CallLog = { ...input, id: newId('call') }
      data.calls = [...(data.calls ?? []), call]
      save()
      callListeners.forEach((listener) => listener(call))
      return call
    },

    subscribeCalls(conversationId: string, onInsert: (call: CallLog) => void): () => void {
      const listener = (call: CallLog) => {
        if (call.conversationId === conversationId) onInsert(call)
      }
      callListeners.add(listener)
      return () => callListeners.delete(listener)
    },

    async searchUsers(query: string): Promise<SearchPerson[]> {
      const me = requireUser()
      const needle = query.trim().toLowerCase()
      if (!needle) return []
      return data.profiles
        .filter((profile) => profile.id !== me && profile.username.includes(needle))
        .slice(0, 20)
        .map((profile) => {
          const request = requestBetween(me, profile.id)
          return {
            ...profile,
            requestId: request?.id ?? null,
            requestStatus: request?.status ?? null,
            requestFromId: request?.fromId ?? null,
          }
        })
    },

    async listRequests(): Promise<ContactRequest[]> {
      const me = requireUser()
      return (data.requests ?? [])
        .filter((request) => request.status === 'pending' && (request.fromId === me || request.toId === me))
        .map((request) => toContactRequest(request, me))
    },

    async requestContact(userId: string): Promise<void> {
      const me = requireUser()
      if (userId === me) throw new Error('You cannot add yourself.')
      if (!profileById(userId)) throw new Error('User not found.')
      const existing = requestBetween(me, userId)
      const now = new Date().toISOString()
      if (!existing) {
        data.requests = data.requests ?? []
        data.requests.unshift({ id: newId('req'), fromId: me, toId: userId, status: 'pending', createdAt: now, updatedAt: now })
      } else if (existing.status === 'declined') {
        existing.fromId = me
        existing.toId = userId
        existing.status = 'pending'
        existing.updatedAt = now
      }
      save()
      requestListeners.forEach((listener) => listener())
    },

    async acceptRequest(requestId: string): Promise<string> {
      const me = requireUser()
      const request = (data.requests ?? []).find((item) => item.id === requestId)
      if (!request || request.toId !== me || request.status !== 'pending') throw new Error('That request is not waiting for you.')
      request.status = 'accepted'
      request.updatedAt = new Date().toISOString()
      save()
      requestListeners.forEach((listener) => listener())
      return this.startConversation(request.fromId)
    },

    async declineRequest(requestId: string): Promise<void> {
      const me = requireUser()
      const request = (data.requests ?? []).find((item) => item.id === requestId)
      if (!request || request.toId !== me || request.status !== 'pending') throw new Error('That request is not waiting for you.')
      request.status = 'declined'
      request.updatedAt = new Date().toISOString()
      save()
      requestListeners.forEach((listener) => listener())
    },

    async cancelRequest(requestId: string): Promise<void> {
      const me = requireUser()
      const request = (data.requests ?? []).find((item) => item.id === requestId)
      if (!request || request.fromId !== me || request.status !== 'pending') throw new Error('That request is not yours to cancel.')
      data.requests = (data.requests ?? []).filter((item) => item.id !== requestId)
      save()
      requestListeners.forEach((listener) => listener())
    },

    subscribeRequests(onChange: () => void): () => void {
      requestListeners.add(onChange)
      return () => requestListeners.delete(onChange)
    },

    async startConversation(otherUserId: string): Promise<string> {
      const me = requireUser()
      if (otherUserId === me) throw new Error('You cannot start a chat with yourself.')
      if (!profileById(otherUserId)) throw new Error('User not found.')
      if (!areContacts(me, otherUserId)) throw new Error('Contacts must accept a request before a chat can start.')
      if (isBlocked(me, otherUserId)) throw new Error('This chat is blocked.')
      const existing = data.conversations.find((conversation) => {
        const members = conversation.memberIds
        return (conversation.kind ?? 'direct') === 'direct' && members.includes(me) && members.includes(otherUserId) && members.length === 2
      })
      if (existing) return existing.id
      const id = newId('chat')
      data.conversations.unshift({
        id,
        memberIds: [me, otherUserId],
        updatedAt: new Date().toISOString(),
        kind: 'direct',
      })
      save()
      return id
    },

    async sendMessage(conversationId: string, body: string, reply?: ReplyTarget | null): Promise<Message> {
      const me = requireUser()
      const conversation = data.conversations.find((item) => item.id === conversationId)
      if (!conversation) throw new Error('That chat is not yours.')
      assertCanSend(conversation, me)
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
      unarchiveOnMessage(conversation.id)
      save()
      emitInsert(message)
      return message
    },

    async sendMedia(input: OutgoingMedia): Promise<Message> {
      const me = requireUser()
      const conversation = data.conversations.find((item) => item.id === input.conversationId)
      if (!conversation) throw new Error('That chat is not yours.')
      assertCanSend(conversation, me)
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
      unarchiveOnMessage(conversation.id)
      save()
      emitInsert({ ...message, waveform: message.waveform ? encodeWaveform(message.waveform).split(',').map(Number) : null })
      return message
    },

    async editMessage(messageId: string, body: string): Promise<void> {
      const me = requireUser()
      const text = body.trim()
      if (!text || text.length > 4000) throw new Error('Write a message first.')
      const stored = data.messages.find((item) => item.id === messageId && item.senderId === me)
      if (!stored || stored.deletedAt || (stored.kind && stored.kind !== 'text')) {
        throw new Error('That message cannot be edited.')
      }
      stored.body = text
      stored.editedAt = new Date().toISOString()
      save()
      emitUpdate({ ...stored })
    },

    async blockUser(userId: string): Promise<void> {
      const me = requireUser()
      if (userId === me) throw new Error('You cannot block yourself.')
      if (!profileById(userId)) throw new Error('User not found.')
      if (!blockedByMe(me, userId)) {
        data.blocks = data.blocks ?? []
        data.blocks.push({ blockerId: me, blockedId: userId, createdAt: new Date().toISOString() })
        save()
      }
    },

    async unblockUser(userId: string): Promise<void> {
      const me = requireUser()
      data.blocks = (data.blocks ?? []).filter((block) => !(block.blockerId === me && block.blockedId === userId))
      save()
    },

    async listBlocked(): Promise<BlockedPerson[]> {
      const me = requireUser()
      return (data.blocks ?? [])
        .filter((block) => block.blockerId === me)
        .map((block) => {
          const profile = profileById(block.blockedId)
          return {
            id: block.blockedId,
            username: profile?.username ?? 'fan',
            avatarUrl: profile?.avatarUrl ?? null,
            isCreator: Boolean(profile?.isCreator),
            blockedAt: block.createdAt,
          }
        })
    },

    async reportUser(userId: string, reason: string, details: string, conversationId?: string | null): Promise<void> {
      const me = requireUser()
      if (userId === me) throw new Error('You cannot report yourself.')
      if (!profileById(userId)) throw new Error('User not found.')
      if (!REPORT_REASONS.includes(reason as (typeof REPORT_REASONS)[number])) throw new Error('Choose a reason.')
      const note = details.trim()
      if (note.length > 1000) throw new Error('Keep the details under 1000 characters.')
      if (conversationId) {
        const conversation = data.conversations.find((item) => item.id === conversationId)
        if (!conversation?.memberIds.includes(me)) throw new Error('That chat is not yours.')
      }
      data.reports = data.reports ?? []
      data.reports.unshift({
        id: newId('report'),
        reporterId: me,
        reportedId: userId,
        conversationId: conversationId ?? null,
        reason,
        details: note || null,
        createdAt: new Date().toISOString(),
      })
      save()
    },

    async listReports(): Promise<UserReport[]> {
      const me = requireUser()
      if (!profileById(me)?.isCreator) throw new Error('Reports are visible to the creator only.')
      return (data.reports ?? []).map((report) => ({
        id: report.id,
        reporterId: report.reporterId,
        reporterUsername: profileById(report.reporterId)?.username ?? 'fan',
        reportedId: report.reportedId,
        reportedUsername: profileById(report.reportedId)?.username ?? 'fan',
        conversationId: report.conversationId,
        reason: report.reason,
        details: report.details,
        createdAt: report.createdAt,
      }))
    },

    async setChatPref(conversationId: string, patch: ChatPrefPatch): Promise<void> {
      const me = requireUser()
      const conversation = data.conversations.find((item) => item.id === conversationId && item.memberIds.includes(me))
      if (!conversation) throw new Error('That chat is not yours.')
      data.prefs = data.prefs ?? []
      let pref = prefFor(me, conversationId)
      if (!pref) {
        pref = { userId: me, conversationId, pinned: false, muted: false, archived: false }
        data.prefs.push(pref)
      }
      const nextPinned = patch.pinned ?? pref.pinned
      if (nextPinned && !pref.pinned) {
        const count = data.prefs.filter((item) => item.userId === me && item.pinned && item.conversationId !== conversationId).length
        if (count >= 3) throw new Error('You can pin up to 3 chats')
      }
      if (patch.pinned !== undefined) pref.pinned = patch.pinned
      if (patch.muted !== undefined) pref.muted = patch.muted
      if (patch.archived !== undefined) pref.archived = patch.archived
      save()
    },

    async createGroup(title: string, memberIds: string[]): Promise<string> {
      const me = requireUser()
      const name = title.trim()
      if (!name || name.length > 80) throw new Error('Give the group a name.')
      const chosen = [...new Set(memberIds.filter((id) => id && id !== me))]
      if (chosen.length < 1) throw new Error('Add at least one person.')
      for (const id of chosen) {
        if (!profileById(id) || !areContacts(me, id) || isBlocked(me, id)) {
          throw new Error('Groups can only include accepted contacts.')
        }
      }
      const id = newId('grp')
      const roles: Record<string, 'admin' | 'member'> = { [me]: 'admin' }
      chosen.forEach((memberId) => {
        roles[memberId] = 'member'
      })
      data.conversations.unshift({
        id,
        memberIds: [me, ...chosen],
        updatedAt: new Date().toISOString(),
        kind: 'group',
        title: name,
        photoUrl: null,
        createdBy: me,
        roles,
      })
      save()
      return id
    },

    async listMembers(conversationId: string): Promise<GroupMember[]> {
      const me = requireUser()
      const conversation = data.conversations.find((item) => item.id === conversationId)
      if (!conversation?.memberIds.includes(me)) throw new Error('That chat is not yours.')
      return conversation.memberIds.map((id) => {
        const profile = profileById(id)
        return {
          id,
          username: profile?.username ?? 'fan',
          avatarUrl: profile?.avatarUrl ?? null,
          favouriteAnime: profile?.favouriteAnime ?? null,
          isCreator: Boolean(profile?.isCreator),
          role: conversation.roles?.[id] ?? 'member',
        }
      })
    },

    async addMember(conversationId: string, userId: string): Promise<void> {
      const me = requireUser()
      const conversation = requireGroup(conversationId, me)
      requireAdmin(conversation, me)
      if (!profileById(userId) || !areContacts(me, userId) || isBlocked(me, userId)) {
        throw new Error('Groups can only include accepted contacts.')
      }
      if (!conversation.memberIds.includes(userId)) conversation.memberIds.push(userId)
      conversation.roles = conversation.roles ?? {}
      conversation.roles[userId] = conversation.roles[userId] ?? 'member'
      save()
    },

    async removeMember(conversationId: string, userId: string): Promise<void> {
      const me = requireUser()
      const conversation = requireGroup(conversationId, me)
      requireAdmin(conversation, me)
      if (userId === me) throw new Error('Use leave to exit the group.')
      conversation.memberIds = conversation.memberIds.filter((id) => id !== userId)
      if (conversation.roles) delete conversation.roles[userId]
      save()
    },

    async setMemberRole(conversationId: string, userId: string, role: 'admin' | 'member'): Promise<void> {
      const me = requireUser()
      const conversation = requireGroup(conversationId, me)
      requireAdmin(conversation, me)
      if (!conversation.memberIds.includes(userId)) throw new Error('That person is not in the group.')
      const others = conversation.memberIds.filter((id) => id !== userId && conversation.roles?.[id] === 'admin')
      if (role === 'member' && others.length === 0) throw new Error('The group needs an admin.')
      conversation.roles = conversation.roles ?? {}
      conversation.roles[userId] = role
      save()
    },

    async renameGroup(conversationId: string, title: string): Promise<void> {
      const me = requireUser()
      const conversation = requireGroup(conversationId, me)
      requireAdmin(conversation, me)
      const name = title.trim()
      if (!name || name.length > 80) throw new Error('Give the group a name.')
      conversation.title = name
      save()
    },

    async setGroupPhoto(conversationId: string, file: Blob): Promise<void> {
      const me = requireUser()
      const conversation = requireGroup(conversationId, me)
      requireAdmin(conversation, me)
      if (typeof FileReader === 'undefined') {
        conversation.photoUrl = 'demo-group-photo'
      } else {
        conversation.photoUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = () => reject(new Error('Could not read that image.'))
          reader.readAsDataURL(file)
        })
      }
      save()
    },

    async leaveGroup(conversationId: string): Promise<void> {
      const me = requireUser()
      const conversation = requireGroup(conversationId, me)
      conversation.memberIds = conversation.memberIds.filter((id) => id !== me)
      if (conversation.roles) delete conversation.roles[me]
      if (conversation.memberIds.length === 0) {
        data.conversations = data.conversations.filter((item) => item.id !== conversation.id)
        data.messages = data.messages.filter((message) => message.conversationId !== conversation.id)
      } else if (!conversation.memberIds.some((id) => conversation.roles?.[id] === 'admin')) {
        conversation.roles = conversation.roles ?? {}
        conversation.roles[conversation.memberIds[0]] = 'admin'
      }
      save()
    },

    async deleteGroup(conversationId: string): Promise<void> {
      const me = requireUser()
      const conversation = requireGroup(conversationId, me)
      requireAdmin(conversation, me)
      data.conversations = data.conversations.filter((item) => item.id !== conversation.id)
      data.messages = data.messages.filter((message) => message.conversationId !== conversation.id)
      save()
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
    parsed.blocks = parsed.blocks ?? []
    parsed.reports = parsed.reports ?? []
    parsed.prefs = parsed.prefs ?? []
    parsed.calls = parsed.calls ?? []
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
