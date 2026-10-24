// Community store interface shared by the local fallback and the Supabase
// implementation. The page code only talks to this interface, so a missing
// Supabase migration can never crash the Communities section: the caller
// falls back to the local store instead.

import {
  canActOnMember,
  communityNameIssue,
  containsFilteredWord,
  demoCommunityProfiles,
  inviteCodeFor,
  isCommunityManager,
  makeInviteCode,
  slowModeBlocked,
  type Community,
  type CommunityChannel,
  type CommunityEvent,
  type CommunityMember,
  type CommunityMessage,
  type CommunityReport,
  type CommunityRole,
  type CommunityVisibility,
  type CommunityVoiceRoom,
} from '../lib/communities'
import type { Profile } from '../types'

export class CommunitiesNotReadyError extends Error {
  constructor() {
    super('Communities tables are not set up yet.')
    this.name = 'CommunitiesNotReadyError'
  }
}

export type CommunityStore = {
  listCommunities(): Promise<Community[]>
  createCommunity(input: { name: string; description: string; visibility: CommunityVisibility; favouriteAnime: string | null }): Promise<Community>
  joinCommunity(communityId: string, inviteCode?: string): Promise<Community>
  approveMember(communityId: string, userId: string): Promise<void>
  declineMember(communityId: string, userId: string): Promise<void>
  listMembers(communityId: string): Promise<CommunityMember[]>
  removeMember(communityId: string, userId: string): Promise<void>
  setMemberRole(communityId: string, userId: string, role: 'admin' | 'member'): Promise<void>
  muteMember(communityId: string, userId: string, minutes: number): Promise<void>
  banMember(communityId: string, userId: string): Promise<void>
  unbanMember(communityId: string, userId: string): Promise<void>
  listBanned(communityId: string): Promise<CommunityMember[]>
  setSlowMode(communityId: string, seconds: number): Promise<void>
  setWordFilter(communityId: string, words: string[]): Promise<void>
  listChannels(communityId: string): Promise<CommunityChannel[]>
  createChannel(communityId: string, name: string, kind: 'text' | 'announcements'): Promise<CommunityChannel>
  listMessages(channelId: string): Promise<CommunityMessage[]>
  sendMessage(channelId: string, body: string): Promise<CommunityMessage>
  togglePin(messageId: string): Promise<void>
  createPoll(channelId: string, question: string, options: string[]): Promise<CommunityMessage>
  votePoll(messageId: string, optionIndex: number): Promise<void>
  reportMessage(communityId: string, messageId: string, reason: string, details: string): Promise<void>
  listReports(communityId: string): Promise<CommunityReport[]>
  listEvents(communityId: string): Promise<CommunityEvent[]>
  createEvent(communityId: string, input: { title: string; description: string; startsAt: string }): Promise<CommunityEvent>
  rsvpEvent(eventId: string, answer: 'yes' | 'maybe' | 'no'): Promise<void>
  listVoiceRooms(communityId: string): Promise<CommunityVoiceRoom[]>
  createVoiceRoom(communityId: string, name: string): Promise<CommunityVoiceRoom>
}

type LocalState = {
  communities: Community[]
  members: Record<string, CommunityMember[]>
  banned: Record<string, CommunityMember[]>
  channels: CommunityChannel[]
  messages: CommunityMessage[]
  events: CommunityEvent[]
  voiceRooms: CommunityVoiceRoom[]
  reports: CommunityReport[]
  lastSentAt: Record<string, string>
  profiles: Profile[]
}

const STORAGE_KEY = 'tatalk:communities-v1'

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`
}

function nowIso(): string {
  return new Date().toISOString()
}

function seedState(me: Profile): LocalState {
  const profiles = demoCommunityProfiles(me)
  const byId = new Map(profiles.map((item) => [item.id, item]))
  const profileOf = (id: string): Profile =>
    byId.get(id) ?? { id, username: 'fan', avatarUrl: null, favouriteAnime: null }
  const member = (userId: string, role: CommunityRole, joinedAt: string): CommunityMember => {
    const profile = profileOf(userId)
    return {
      id: `member-${userId}`,
      userId,
      username: profile.username,
      avatarUrl: profile.avatarUrl,
      favouriteAnime: profile.favouriteAnime,
      role,
      mutedUntil: null,
      joinedAt,
    }
  }
  const mine: Community = {
    id: 'community-anime-nights',
    name: 'Anime Nights',
    description: 'A demo community for anime fans. Watch parties, episode chats and recommendations.',
    visibility: 'public',
    inviteCode: inviteCodeFor('community-anime-nights'),
    ownerId: me.id,
    favouriteAnime: me.favouriteAnime,
    memberCount: 3,
    myRole: 'owner',
    slowModeSeconds: 0,
    wordFilter: [],
    createdAt: '2026-10-24T00:00:00.000Z',
  }
  const discoverable: Community = {
    id: 'community-study-create',
    name: 'Study & Create',
    description: 'A public demo community for study rooms and creative work.',
    visibility: 'public',
    inviteCode: inviteCodeFor('community-study-create'),
    ownerId: 'demo-sakura',
    favouriteAnime: 'Frieren',
    memberCount: 2,
    myRole: null,
    slowModeSeconds: 0,
    wordFilter: [],
    createdAt: '2026-10-24T00:00:00.000Z',
  }
  const channels: CommunityChannel[] = [
    { id: 'channel-anime-general', communityId: mine.id, name: 'general', kind: 'text', createdAt: mine.createdAt },
    { id: 'channel-anime-announcements', communityId: mine.id, name: 'announcements', kind: 'announcements', createdAt: mine.createdAt },
    { id: 'channel-study-general', communityId: discoverable.id, name: 'general', kind: 'text', createdAt: discoverable.createdAt },
  ]
  return {
    communities: [mine, discoverable],
    members: {
      [mine.id]: [member(me.id, 'owner', mine.createdAt), member('demo-sakura', 'member', mine.createdAt), member('demo-ren', 'member', mine.createdAt)],
      [discoverable.id]: [member('demo-sakura', 'owner', discoverable.createdAt), member('demo-mio', 'member', discoverable.createdAt)],
    },
    banned: {},
    channels,
    messages: [
      {
        id: 'msg-welcome',
        channelId: channels[0].id,
        senderId: 'demo-sakura',
        senderUsername: 'sakura',
        senderAvatarUrl: null,
        senderFavouriteAnime: 'Frieren',
        body: 'Welcome to Anime Nights! Share what you are watching this week.',
        createdAt: mine.createdAt,
        pinned: true,
        poll: null,
      },
    ],
    events: [
      {
        id: 'event-watch-party',
        communityId: mine.id,
        title: 'Friday watch party',
        description: 'Join the group voice room and watch together.',
        startsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        createdBy: me.id,
        rsvps: [{ userId: me.id, answer: 'yes' }],
      },
    ],
    voiceRooms: [
      { id: 'room-lounge', communityId: mine.id, name: 'Lounge', createdBy: me.id, createdAt: mine.createdAt },
    ],
    reports: [],
    lastSentAt: {},
    profiles,
  }
}

function loadState(me: Profile): LocalState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return seedState(me)
    const parsed = JSON.parse(raw) as LocalState
    if (!Array.isArray(parsed.communities) || !parsed.channels) return seedState(me)
    // Keep the signed-in user as owner of the seeded demo community so the
    // demo always has a community the user can manage.
    const mine = parsed.communities.find((item) => item.id === 'community-anime-nights')
    if (mine) {
      mine.ownerId = me.id
      mine.myRole = 'owner'
      const members = parsed.members[mine.id] ?? []
      const owner = members.find((item) => item.role === 'owner')
      if (owner) {
        owner.userId = me.id
        owner.username = me.username
        owner.avatarUrl = me.avatarUrl
        owner.favouriteAnime = me.favouriteAnime
      }
    }
    return parsed
  } catch {
    return seedState(me)
  }
}

/**
 * Local fallback store, following the app's existing demo pattern: data
 * lives in this browser only, nothing is sent to a server, and the UI works
 * without Supabase. Used in demo mode and when the Supabase migration has
 * not been applied yet.
 */
export function createLocalCommunityStore(me: Profile): CommunityStore {
  const state = loadState(me)
  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // Storage may be full or unavailable; the in-memory copy still works.
    }
  }
  const communityOf = (id: string): Community => {
    const found = state.communities.find((item) => item.id === id)
    if (!found) throw new Error('That community was not found.')
    return found
  }
  const myMembership = (communityId: string): CommunityMember | undefined =>
    state.members[communityId]?.find((item) => item.userId === me.id)
  const requireMember = (communityId: string): CommunityMember => {
    const membership = myMembership(communityId)
    if (!membership || membership.role === 'pending') throw new Error('Join this community first.')
    return membership
  }
  const requireManager = (communityId: string): CommunityMember => {
    const membership = requireMember(communityId)
    if (!isCommunityManager(membership.role)) throw new Error('Only an owner or admin can do that.')
    return membership
  }
  const refreshCounts = () => {
    for (const community of state.communities) {
      const members = state.members[community.id] ?? []
      community.memberCount = members.filter((item) => item.role !== 'pending').length
      community.myRole = members.find((item) => item.userId === me.id)?.role ?? null
    }
  }
  const channelOf = (channelId: string): CommunityChannel => {
    const found = state.channels.find((item) => item.id === channelId)
    if (!found) throw new Error('That channel was not found.')
    return found
  }

  return {
    async listCommunities() {
      refreshCounts()
      return [...state.communities]
    },
    async createCommunity(input) {
      const issue = communityNameIssue(input.name)
      if (issue) throw new Error(issue)
      const community: Community = {
        id: newId('community'),
        name: input.name.trim(),
        description: input.description.trim().slice(0, 500),
        visibility: input.visibility,
        inviteCode: makeInviteCode(),
        ownerId: me.id,
        favouriteAnime: input.favouriteAnime,
        memberCount: 1,
        myRole: 'owner',
        slowModeSeconds: 0,
        wordFilter: [],
        createdAt: nowIso(),
      }
      state.communities.unshift(community)
      state.members[community.id] = [{
        id: newId('member'), userId: me.id, username: me.username, avatarUrl: me.avatarUrl,
        favouriteAnime: me.favouriteAnime, role: 'owner', mutedUntil: null, joinedAt: community.createdAt,
      }]
      state.channels.push(
        { id: newId('channel'), communityId: community.id, name: 'general', kind: 'text', createdAt: community.createdAt },
        { id: newId('channel'), communityId: community.id, name: 'announcements', kind: 'announcements', createdAt: community.createdAt },
      )
      save()
      return community
    },
    async joinCommunity(communityId, inviteCode) {
      const community = communityOf(communityId)
      if (state.banned[communityId]?.some((item) => item.userId === me.id)) {
        throw new Error('You are banned from this community.')
      }
      const existing = myMembership(communityId)
      if (existing) {
        if (existing.role === 'pending') throw new Error('Your join request is still pending.')
        return community
      }
      if (community.visibility === 'invite-only' && inviteCode?.trim().toUpperCase() !== community.inviteCode) {
        throw new Error('That invite code does not match this community.')
      }
      const role: CommunityRole = community.visibility === 'public' ? 'member' : 'pending'
      const members = state.members[communityId] ?? []
      members.push({
        id: newId('member'), userId: me.id, username: me.username, avatarUrl: me.avatarUrl,
        favouriteAnime: me.favouriteAnime, role, mutedUntil: null, joinedAt: nowIso(),
      })
      state.members[communityId] = members
      refreshCounts()
      save()
      return communityOf(communityId)
    },
    async approveMember(communityId, userId) {
      requireManager(communityId)
      const target = state.members[communityId]?.find((item) => item.userId === userId)
      if (!target || target.role !== 'pending') throw new Error('That join request was not found.')
      target.role = 'member'
      refreshCounts()
      save()
    },
    async declineMember(communityId, userId) {
      requireManager(communityId)
      state.members[communityId] = (state.members[communityId] ?? []).filter(
        (item) => !(item.userId === userId && item.role === 'pending'),
      )
      refreshCounts()
      save()
    },
    async listMembers(communityId) {
      requireMember(communityId)
      return [...(state.members[communityId] ?? [])]
    },
    async removeMember(communityId, userId) {
      const actor = requireManager(communityId)
      const target = (state.members[communityId] ?? []).find((item) => item.userId === userId)
      if (!target || !canActOnMember(actor.role, target, me.id)) throw new Error('You cannot remove that member.')
      state.members[communityId] = (state.members[communityId] ?? []).filter((item) => item.userId !== userId)
      refreshCounts()
      save()
    },
    async setMemberRole(communityId, userId, role) {
      const actor = requireManager(communityId)
      const target = (state.members[communityId] ?? []).find((item) => item.userId === userId)
      if (!target || !canActOnMember(actor.role, target, me.id)) throw new Error('You cannot change that member’s role.')
      target.role = role
      save()
    },
    async muteMember(communityId, userId, minutes) {
      const actor = requireManager(communityId)
      const target = (state.members[communityId] ?? []).find((item) => item.userId === userId)
      if (!target || !canActOnMember(actor.role, target, me.id)) throw new Error('You cannot mute that member.')
      target.mutedUntil = new Date(Date.now() + Math.max(1, minutes) * 60 * 1000).toISOString()
      save()
    },
    async banMember(communityId, userId) {
      const actor = requireManager(communityId)
      const target = (state.members[communityId] ?? []).find((item) => item.userId === userId)
      if (!target || !canActOnMember(actor.role, target, me.id)) throw new Error('You cannot ban that member.')
      state.members[communityId] = (state.members[communityId] ?? []).filter((item) => item.userId !== userId)
      state.banned[communityId] = [...(state.banned[communityId] ?? []), target]
      refreshCounts()
      save()
    },
    async unbanMember(communityId, userId) {
      requireManager(communityId)
      state.banned[communityId] = (state.banned[communityId] ?? []).filter((item) => item.userId !== userId)
      save()
    },
    async listBanned(communityId) {
      requireManager(communityId)
      return [...(state.banned[communityId] ?? [])]
    },
    async setSlowMode(communityId, seconds) {
      requireManager(communityId)
      communityOf(communityId).slowModeSeconds = Math.max(0, Math.min(300, Math.floor(seconds)))
      save()
    },
    async setWordFilter(communityId, words) {
      requireManager(communityId)
      communityOf(communityId).wordFilter = words.map((word) => word.trim().toLowerCase()).filter(Boolean).slice(0, 50)
      save()
    },
    async listChannels(communityId) {
      requireMember(communityId)
      return state.channels.filter((item) => item.communityId === communityId)
    },
    async createChannel(communityId, name, kind) {
      requireManager(communityId)
      const clean = name.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 40)
      if (!clean) throw new Error('Give the channel a name.')
      const channel: CommunityChannel = { id: newId('channel'), communityId, name: clean, kind, createdAt: nowIso() }
      state.channels.push(channel)
      save()
      return channel
    },
    async listMessages(channelId) {
      const channel = channelOf(channelId)
      requireMember(channel.communityId)
      return state.messages
        .filter((item) => item.channelId === channelId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    },
    async sendMessage(channelId, body) {
      const channel = channelOf(channelId)
      const membership = requireMember(channel.communityId)
      if (membership.mutedUntil && new Date(membership.mutedUntil).getTime() > Date.now()) {
        throw new Error('You are muted in this community for now.')
      }
      const community = communityOf(channel.communityId)
      if (slowModeBlocked(state.lastSentAt[`${channel.communityId}:${me.id}`] ?? null, community.slowModeSeconds)) {
        throw new Error(`Slow mode is on. Wait ${community.slowModeSeconds} seconds between messages.`)
      }
      const filtered = containsFilteredWord(body, community.wordFilter)
      if (filtered) throw new Error(`That message contains a filtered word: ${filtered}`)
      const text = body.trim()
      if (!text) throw new Error('Write a message first.')
      if (text.length > 2000) throw new Error('Keep messages under 2000 characters.')
      const message: CommunityMessage = {
        id: newId('msg'), channelId, senderId: me.id, senderUsername: me.username,
        senderAvatarUrl: me.avatarUrl, senderFavouriteAnime: me.favouriteAnime,
        body: text, createdAt: nowIso(), pinned: false, poll: null,
      }
      state.messages.push(message)
      state.lastSentAt[`${channel.communityId}:${me.id}`] = message.createdAt
      save()
      return message
    },
    async togglePin(messageId) {
      const message = state.messages.find((item) => item.id === messageId)
      if (!message) throw new Error('That message was not found.')
      const channel = channelOf(message.channelId)
      requireManager(channel.communityId)
      message.pinned = !message.pinned
      save()
    },
    async createPoll(channelId, question, options) {
      const channel = channelOf(channelId)
      requireMember(channel.communityId)
      const cleanOptions = options.map((item) => item.trim()).filter(Boolean).slice(0, 5)
      if (!question.trim() || cleanOptions.length < 2) throw new Error('A poll needs a question and at least two options.')
      const message: CommunityMessage = {
        id: newId('msg'), channelId, senderId: me.id, senderUsername: me.username,
        senderAvatarUrl: me.avatarUrl, senderFavouriteAnime: me.favouriteAnime,
        body: question.trim(), createdAt: nowIso(), pinned: false,
        poll: cleanOptions.map((text) => ({ text, votes: [] })),
      }
      state.messages.push(message)
      save()
      return message
    },
    async votePoll(messageId, optionIndex) {
      const message = state.messages.find((item) => item.id === messageId)
      if (!message?.poll) throw new Error('That poll was not found.')
      const channel = channelOf(message.channelId)
      requireMember(channel.communityId)
      for (const option of message.poll) option.votes = option.votes.filter((id) => id !== me.id)
      const option = message.poll[optionIndex]
      if (!option) throw new Error('That poll option was not found.')
      option.votes.push(me.id)
      save()
    },
    async reportMessage(communityId, messageId, reason, details) {
      requireMember(communityId)
      const message = state.messages.find((item) => item.id === messageId)
      state.reports.push({
        id: newId('report'), communityId, reporterId: me.id, reporterUsername: me.username,
        messageId, reason, details: details.trim().slice(0, 500), createdAt: nowIso(),
      })
      void message
      save()
    },
    async listReports(communityId) {
      requireManager(communityId)
      return state.reports.filter((item) => item.communityId === communityId)
    },
    async listEvents(communityId) {
      requireMember(communityId)
      return state.events
        .filter((item) => item.communityId === communityId)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    },
    async createEvent(communityId, input) {
      requireManager(communityId)
      if (!input.title.trim()) throw new Error('Give the event a title.')
      if (Number.isNaN(new Date(input.startsAt).getTime())) throw new Error('Choose a valid event date and time.')
      const event: CommunityEvent = {
        id: newId('event'), communityId, title: input.title.trim(),
        description: input.description.trim().slice(0, 500), startsAt: input.startsAt,
        createdBy: me.id, rsvps: [],
      }
      state.events.push(event)
      save()
      return event
    },
    async rsvpEvent(eventId, answer) {
      const event = state.events.find((item) => item.id === eventId)
      if (!event) throw new Error('That event was not found.')
      requireMember(event.communityId)
      event.rsvps = event.rsvps.filter((item) => item.userId !== me.id)
      event.rsvps.push({ userId: me.id, answer })
      save()
    },
    async listVoiceRooms(communityId) {
      requireMember(communityId)
      return state.voiceRooms.filter((item) => item.communityId === communityId)
    },
    async createVoiceRoom(communityId, name) {
      requireManager(communityId)
      if (!name.trim()) throw new Error('Give the voice room a name.')
      const room: CommunityVoiceRoom = { id: newId('room'), communityId, name: name.trim().slice(0, 60), createdBy: me.id, createdAt: nowIso() }
      state.voiceRooms.push(room)
      save()
      return room
    },
  }
}
