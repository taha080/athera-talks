// Athera Communities: types and pure helpers.
//
// Communities live beside direct chats and groups. They are not a replacement
// for either: a community is a multi-user space with its own channels,
// events, voice rooms and moderation, while chats and groups stay untouched.
// The same Profile shape is reused everywhere (username, avatarUrl,
// favouriteAnime), so a member profile in a community is the same profile
// shown in a chat.
//
// Two stores implement the same interface (see services/communityStore.ts
// for the local fallback and services/communityBackend.ts for Supabase):
// the page prefers Supabase when its tables exist and falls back to the
// local store otherwise, exactly like the existing setup/demo pattern.

import type { Profile } from '../types'

export type CommunityVisibility = 'public' | 'private' | 'invite-only'
export type CommunityRole = 'owner' | 'admin' | 'member' | 'pending'

export type CommunityMember = {
  id: string
  userId: string
  username: string
  avatarUrl: string | null
  favouriteAnime: string | null
  role: CommunityRole
  mutedUntil: string | null
  joinedAt: string
}

export type Community = {
  id: string
  name: string
  description: string
  visibility: CommunityVisibility
  inviteCode: string
  ownerId: string
  favouriteAnime: string | null
  memberCount: number
  myRole: CommunityRole | null
  slowModeSeconds: number
  wordFilter: string[]
  createdAt: string
}

export type CommunityChannel = {
  id: string
  communityId: string
  name: string
  kind: 'text' | 'announcements'
  createdAt: string
}

export type PollOption = { text: string; votes: string[] }

export type CommunityMessage = {
  id: string
  channelId: string
  senderId: string
  senderUsername: string
  senderAvatarUrl: string | null
  senderFavouriteAnime: string | null
  body: string
  createdAt: string
  pinned: boolean
  poll: PollOption[] | null
}

export type CommunityEvent = {
  id: string
  communityId: string
  title: string
  description: string
  startsAt: string
  createdBy: string
  rsvps: { userId: string; answer: 'yes' | 'maybe' | 'no' }[]
}

export type CommunityVoiceRoom = {
  id: string
  communityId: string
  name: string
  createdBy: string
  createdAt: string
}

export type CommunityReport = {
  id: string
  communityId: string
  reporterId: string
  reporterUsername: string
  messageId: string | null
  reason: string
  details: string
  createdAt: string
}

export const COMMUNITY_ROLES: CommunityRole[] = ['owner', 'admin', 'member', 'pending']

export function isCommunityManager(role: CommunityRole | null | undefined): boolean {
  return role === 'owner' || role === 'admin'
}

export function canModerate(role: CommunityRole | null | undefined): boolean {
  return isCommunityManager(role)
}

/** A manager may act on members, but never on the owner and never on themselves. */
export function canActOnMember(
  actorRole: CommunityRole | null | undefined,
  target: CommunityMember,
  actorId: string,
): boolean {
  if (!isCommunityManager(actorRole)) return false
  if (target.userId === actorId) return false
  if (target.role === 'owner') return false
  if (actorRole === 'admin' && target.role === 'admin') return false
  return true
}

export function communityNameIssue(name: string): string | null {
  const clean = name.trim()
  if (clean.length < 2) return 'Give the community a name of at least 2 characters.'
  if (clean.length > 60) return 'Keep the community name under 60 characters.'
  return null
}

export function inviteCodeFor(id: string): string {
  // Deterministic, shareable, and not a secret: invite-only communities are
  // still gated by an owner/admin approving the join request.
  const compact = id.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  return `ATH-${(compact + 'XXXXXX').slice(0, 6)}`
}

export function makeInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i += 1) code += chars[Math.floor(Math.random() * chars.length)]
  return `ATH-${code}`
}

export function normalizeFilterWord(word: string): string {
  return word.trim().toLowerCase()
}

export function containsFilteredWord(body: string, filter: string[]): string | null {
  const haystack = ` ${body.toLowerCase()} `
  for (const raw of filter) {
    const word = normalizeFilterWord(raw)
    if (!word) continue
    if (haystack.includes(` ${word} `) || haystack.includes(word)) return word
  }
  return null
}

export function slowModeBlocked(lastSentAt: string | null, slowModeSeconds: number, now = Date.now()): boolean {
  if (!slowModeSeconds || slowModeSeconds <= 0 || !lastSentAt) return false
  return now - new Date(lastSentAt).getTime() < slowModeSeconds * 1000
}

export function pollTotals(poll: PollOption[]): { text: string; votes: number }[] {
  return poll.map((option) => ({ text: option.text, votes: option.votes.length }))
}

export function pollTotalVotes(poll: PollOption[]): number {
  return poll.reduce((sum, option) => sum + option.votes.length, 0)
}

export function upcomingEvents(events: CommunityEvent[], now = new Date()): CommunityEvent[] {
  return events
    .filter((event) => new Date(event.startsAt).getTime() >= now.getTime())
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
}

export function memberProfile(member: CommunityMember): Profile {
  return {
    id: member.userId,
    username: member.username,
    avatarUrl: member.avatarUrl,
    favouriteAnime: member.favouriteAnime,
  }
}

export function demoCommunityProfiles(me: Profile): Profile[] {
  const others: Profile[] = [
    { id: 'demo-sakura', username: 'sakura', avatarUrl: null, favouriteAnime: 'Frieren' },
    { id: 'demo-ren', username: 'ren', avatarUrl: null, favouriteAnime: 'Attack on Titan' },
    { id: 'demo-mio', username: 'mio', avatarUrl: null, favouriteAnime: 'One Piece' },
  ]
  return [me, ...others.filter((item) => item.id !== me.id && item.username !== me.username)]
}
