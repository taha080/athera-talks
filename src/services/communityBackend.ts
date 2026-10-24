// Supabase-backed Communities store. This is only used when the
// communities migration has been applied; otherwise the first query throws
// CommunitiesNotReadyError and the page falls back to the local store
// (see services/communityStore.ts) instead of crashing.
//
// Table names match supabase/migrations/20261024120000_communities.sql.
// No secret is read here: only the browser anon key via getSupabase().

import { getSupabase } from '../lib/supabase'
import type { Community, CommunityMember, CommunityRole, PollOption } from '../lib/communities'
import { CommunitiesNotReadyError, type CommunityStore } from './communityStore'
import type { Profile } from '../types'

function isMissingTable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const code = (error as { code?: string })?.code
  return code === '42P01' || code === 'PGRST205' || /relation .* does not exist|Could not find the table|PGRST205/i.test(message)
}

function notReady(error: unknown): never {
  if (isMissingTable(error)) throw new CommunitiesNotReadyError()
  throw error instanceof Error ? error : new Error('Communities could not be loaded.')
}

function roleOf(value: string | null | undefined): CommunityRole {
  if (value === 'owner' || value === 'admin' || value === 'pending') return value
  return 'member'
}

type CommunityRow = {
  id: string
  name: string
  description: string | null
  visibility: string
  invite_code: string | null
  owner_id: string
  favourite_anime: string | null
  slow_mode_seconds: number | null
  word_filter: string[] | null
  created_at: string
  community_members?: { user_id: string; role: string }[] | null
}

function mapCommunity(row: CommunityRow, meId: string): Community {
  const members = row.community_members ?? []
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    visibility: row.visibility === 'private' || row.visibility === 'invite-only' ? row.visibility : 'public',
    inviteCode: row.invite_code ?? '',
    ownerId: row.owner_id,
    favouriteAnime: row.favourite_anime,
    memberCount: members.length,
    myRole: members.find((item) => item.user_id === meId)?.role ? roleOf(members.find((item) => item.user_id === meId)?.role) : null,
    slowModeSeconds: row.slow_mode_seconds ?? 0,
    wordFilter: row.word_filter ?? [],
    createdAt: row.created_at,
  }
}

function mapMember(row: {
  user_id: string
  role: string
  muted_until: string | null
  joined_at: string
  profiles?: { username: string; avatar_url: string | null; favourite_anime: string | null } | null
}): CommunityMember {
  return {
    id: `member-${row.user_id}`,
    userId: row.user_id,
    username: row.profiles?.username ?? 'fan',
    avatarUrl: row.profiles?.avatar_url ?? null,
    favouriteAnime: row.profiles?.favourite_anime ?? null,
    role: roleOf(row.role),
    mutedUntil: row.muted_until,
    joinedAt: row.joined_at,
  }
}

export async function trySupabaseCommunityStore(me: Profile): Promise<CommunityStore | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  try {
    const { error } = await supabase.from('communities').select('id').limit(1)
    if (error) {
      if (isMissingTable(error)) return null
      throw new Error(error.message)
    }
  } catch (error) {
    if (error instanceof CommunitiesNotReadyError) return null
    if (isMissingTable(error)) return null
    throw error
  }
  return createSupabaseCommunityStore(me)
}

function createSupabaseCommunityStore(me: Profile): CommunityStore {
  const client = () => {
    const supabase = getSupabase()
    if (!supabase) throw new CommunitiesNotReadyError()
    return supabase
  }
  const communityColumns = 'id, name, description, visibility, invite_code, owner_id, favourite_anime, slow_mode_seconds, word_filter, created_at, community_members(user_id, role)'
  const memberColumns = 'user_id, role, muted_until, joined_at, profiles(username, avatar_url, favourite_anime)'

  async function myRole(communityId: string): Promise<CommunityRole | null> {
    const { data, error } = await client()
      .from('community_members')
      .select('role')
      .eq('community_id', communityId)
      .eq('user_id', me.id)
      .maybeSingle()
    if (error) notReady(error)
    return data ? roleOf(data.role) : null
  }
  async function requireManager(communityId: string): Promise<void> {
    const role = await myRole(communityId)
    if (role !== 'owner' && role !== 'admin') throw new Error('Only an owner or admin can do that.')
  }
  async function requireMember(communityId: string): Promise<void> {
    const role = await myRole(communityId)
    if (!role || role === 'pending') throw new Error('Join this community first.')
  }

  return {
    async listCommunities() {
      const { data, error } = await client()
        .from('communities')
        .select(communityColumns)
        .order('created_at', { ascending: false })
      if (error) notReady(error)
      return ((data ?? []) as CommunityRow[]).map((row) => mapCommunity(row, me.id))
    },
    async createCommunity(input) {
      const { data, error } = await client()
        .from('communities')
        .insert({
          name: input.name.trim(),
          description: input.description.trim().slice(0, 500),
          visibility: input.visibility,
          owner_id: me.id,
          favourite_anime: input.favouriteAnime,
        })
        .select(communityColumns)
        .single()
      if (error) notReady(error)
      const community = mapCommunity(data as CommunityRow, me.id)
      const { error: memberError } = await client()
        .from('community_members')
        .insert({ community_id: community.id, user_id: me.id, role: 'owner' })
      if (memberError) notReady(memberError)
      await client().from('community_channels').insert([
        { community_id: community.id, name: 'general', kind: 'text' },
        { community_id: community.id, name: 'announcements', kind: 'announcements' },
      ])
      return { ...community, memberCount: 1, myRole: 'owner' }
    },
    async joinCommunity(communityId, inviteCode) {
      const { data, error } = await client()
        .from('communities')
        .select(communityColumns)
        .eq('id', communityId)
        .single()
      if (error) notReady(error)
      const community = mapCommunity(data as CommunityRow, me.id)
      if (community.visibility === 'invite-only' && inviteCode?.trim().toUpperCase() !== community.inviteCode) {
        throw new Error('That invite code does not match this community.')
      }
      const role: CommunityRole = community.visibility === 'public' ? 'member' : 'pending'
      const { error: joinError } = await client()
        .from('community_members')
        .upsert({ community_id: communityId, user_id: me.id, role }, { onConflict: 'community_id,user_id' })
      if (joinError) notReady(joinError)
      return community
    },
    async approveMember(communityId, userId) {
      await requireManager(communityId)
      const { error } = await client()
        .from('community_members')
        .update({ role: 'member' })
        .eq('community_id', communityId)
        .eq('user_id', userId)
        .eq('role', 'pending')
      if (error) notReady(error)
    },
    async declineMember(communityId, userId) {
      await requireManager(communityId)
      const { error } = await client()
        .from('community_members')
        .delete()
        .eq('community_id', communityId)
        .eq('user_id', userId)
        .eq('role', 'pending')
      if (error) notReady(error)
    },
    async listMembers(communityId) {
      await requireMember(communityId)
      const { data, error } = await client()
        .from('community_members')
        .select(memberColumns)
        .eq('community_id', communityId)
        .order('joined_at')
      if (error) notReady(error)
      return ((data ?? []) as unknown as Parameters<typeof mapMember>[0][]).map(mapMember)
    },
    async removeMember(communityId, userId) {
      await requireManager(communityId)
      const { error } = await client()
        .from('community_members')
        .delete()
        .eq('community_id', communityId)
        .eq('user_id', userId)
      if (error) notReady(error)
    },
    async setMemberRole(communityId, userId, role) {
      await requireManager(communityId)
      const { error } = await client()
        .from('community_members')
        .update({ role })
        .eq('community_id', communityId)
        .eq('user_id', userId)
      if (error) notReady(error)
    },
    async muteMember(communityId, userId, minutes) {
      await requireManager(communityId)
      const { error } = await client()
        .from('community_members')
        .update({ muted_until: new Date(Date.now() + Math.max(1, minutes) * 60 * 1000).toISOString() })
        .eq('community_id', communityId)
        .eq('user_id', userId)
      if (error) notReady(error)
    },
    async banMember(communityId, userId) {
      await requireManager(communityId)
      const { error } = await client()
        .from('community_bans')
        .upsert({ community_id: communityId, user_id: userId, banned_by: me.id }, { onConflict: 'community_id,user_id' })
      if (error) notReady(error)
      await client().from('community_members').delete().eq('community_id', communityId).eq('user_id', userId)
    },
    async unbanMember(communityId, userId) {
      await requireManager(communityId)
      const { error } = await client()
        .from('community_bans')
        .delete()
        .eq('community_id', communityId)
        .eq('user_id', userId)
      if (error) notReady(error)
    },
    async listBanned(communityId) {
      await requireManager(communityId)
      const { data, error } = await client()
        .from('community_bans')
        .select('user_id, created_at, profiles(username, avatar_url, favourite_anime)')
        .eq('community_id', communityId)
      if (error) notReady(error)
      return ((data ?? []) as unknown as { user_id: string; created_at: string; profiles?: { username: string; avatar_url: string | null; favourite_anime: string | null } | null }[]).map((row) => ({
        id: `banned-${row.user_id}`,
        userId: row.user_id,
        username: row.profiles?.username ?? 'fan',
        avatarUrl: row.profiles?.avatar_url ?? null,
        favouriteAnime: row.profiles?.favourite_anime ?? null,
        role: 'member' as const,
        mutedUntil: null,
        joinedAt: row.created_at,
      }))
    },
    async setSlowMode(communityId, seconds) {
      await requireManager(communityId)
      const { error } = await client()
        .from('communities')
        .update({ slow_mode_seconds: Math.max(0, Math.min(300, Math.floor(seconds))) })
        .eq('id', communityId)
      if (error) notReady(error)
    },
    async setWordFilter(communityId, words) {
      await requireManager(communityId)
      const { error } = await client()
        .from('communities')
        .update({ word_filter: words.map((word) => word.trim().toLowerCase()).filter(Boolean).slice(0, 50) })
        .eq('id', communityId)
      if (error) notReady(error)
    },
    async listChannels(communityId) {
      await requireMember(communityId)
      const { data, error } = await client()
        .from('community_channels')
        .select('id, community_id, name, kind, created_at')
        .eq('community_id', communityId)
        .order('created_at')
      if (error) notReady(error)
      return ((data ?? []) as { id: string; community_id: string; name: string; kind: string; created_at: string }[]).map((row) => ({
        id: row.id, communityId: row.community_id, name: row.name,
        kind: row.kind === 'announcements' ? 'announcements' as const : 'text' as const, createdAt: row.created_at,
      }))
    },
    async createChannel(communityId, name, kind) {
      await requireManager(communityId)
      const { data, error } = await client()
        .from('community_channels')
        .insert({ community_id: communityId, name: name.trim().toLowerCase().slice(0, 40), kind })
        .select('id, community_id, name, kind, created_at')
        .single()
      if (error) notReady(error)
      const row = data as { id: string; community_id: string; name: string; kind: string; created_at: string }
      return { id: row.id, communityId: row.community_id, name: row.name, kind: row.kind === 'announcements' ? 'announcements' as const : 'text' as const, createdAt: row.created_at }
    },
    async listMessages(channelId) {
      const { data, error } = await client()
        .from('community_channel_messages')
        .select('id, channel_id, sender_id, body, created_at, pinned, poll_options, poll_votes, profiles(username, avatar_url, favourite_anime)')
        .eq('channel_id', channelId)
        .order('created_at')
      if (error) notReady(error)
      return ((data ?? []) as unknown as {
        id: string; channel_id: string; sender_id: string; body: string; created_at: string; pinned: boolean;
        poll_options: string[] | null; poll_votes: Record<string, number> | null;
        profiles?: { username: string; avatar_url: string | null; favourite_anime: string | null } | null
      }[]).map((row) => {
        const poll: PollOption[] | null = row.poll_options
          ? row.poll_options.map((text, index) => ({
              text,
              votes: Object.entries(row.poll_votes ?? {})
                .filter(([, vote]) => vote === index)
                .map(([userId]) => userId),
            }))
          : null
        return {
          id: row.id, channelId: row.channel_id, senderId: row.sender_id,
          senderUsername: row.profiles?.username ?? 'fan', senderAvatarUrl: row.profiles?.avatar_url ?? null,
          senderFavouriteAnime: row.profiles?.favourite_anime ?? null, body: row.body,
          createdAt: row.created_at, pinned: row.pinned, poll,
        }
      })
    },
    async sendMessage(channelId, body) {
      const text = body.trim()
      if (!text) throw new Error('Write a message first.')
      const { data, error } = await client()
        .from('community_channel_messages')
        .insert({ channel_id: channelId, sender_id: me.id, body: text.slice(0, 2000) })
        .select('id, channel_id, sender_id, body, created_at, pinned, poll_options, poll_votes')
        .single()
      if (error) notReady(error)
      const row = data as { id: string; channel_id: string; sender_id: string; body: string; created_at: string; pinned: boolean }
      return {
        id: row.id, channelId: row.channel_id, senderId: row.sender_id, senderUsername: me.username,
        senderAvatarUrl: me.avatarUrl, senderFavouriteAnime: me.favouriteAnime, body: row.body,
        createdAt: row.created_at, pinned: row.pinned, poll: null,
      }
    },
    async togglePin(messageId) {
      const { data, error } = await client()
        .from('community_channel_messages')
        .select('pinned')
        .eq('id', messageId)
        .single()
      if (error) notReady(error)
      const { error: updateError } = await client()
        .from('community_channel_messages')
        .update({ pinned: !(data as { pinned: boolean }).pinned })
        .eq('id', messageId)
      if (updateError) notReady(updateError)
    },
    async createPoll(channelId, question, options) {
      const cleanOptions = options.map((item) => item.trim()).filter(Boolean).slice(0, 5)
      if (!question.trim() || cleanOptions.length < 2) throw new Error('A poll needs a question and at least two options.')
      const { data, error } = await client()
        .from('community_channel_messages')
        .insert({ channel_id: channelId, sender_id: me.id, body: question.trim(), poll_options: cleanOptions, poll_votes: {} })
        .select('id, channel_id, sender_id, body, created_at, pinned, poll_options')
        .single()
      if (error) notReady(error)
      const row = data as { id: string; channel_id: string; sender_id: string; body: string; created_at: string; pinned: boolean; poll_options: string[] }
      return {
        id: row.id, channelId: row.channel_id, senderId: row.sender_id, senderUsername: me.username,
        senderAvatarUrl: me.avatarUrl, senderFavouriteAnime: me.favouriteAnime, body: row.body,
        createdAt: row.created_at, pinned: row.pinned,
        poll: row.poll_options.map((text) => ({ text, votes: [] })),
      }
    },
    async votePoll(messageId, optionIndex) {
      const { data, error } = await client()
        .from('community_channel_messages')
        .select('poll_votes')
        .eq('id', messageId)
        .single()
      if (error) notReady(error)
      const votes = { ...((data as { poll_votes: Record<string, number> | null }).poll_votes ?? {}), [me.id]: optionIndex }
      const { error: updateError } = await client()
        .from('community_channel_messages')
        .update({ poll_votes: votes })
        .eq('id', messageId)
      if (updateError) notReady(updateError)
    },
    async reportMessage(communityId, messageId, reason, details) {
      await requireMember(communityId)
      const { error } = await client()
        .from('community_reports')
        .insert({ community_id: communityId, reporter_id: me.id, message_id: messageId, reason, details: details.trim().slice(0, 500) })
      if (error) notReady(error)
    },
    async listReports(communityId) {
      await requireManager(communityId)
      const { data, error } = await client()
        .from('community_reports')
        .select('id, community_id, reporter_id, message_id, reason, details, created_at, profiles(username)')
        .eq('community_id', communityId)
        .order('created_at', { ascending: false })
      if (error) notReady(error)
      return ((data ?? []) as unknown as {
        id: string; community_id: string; reporter_id: string; message_id: string | null; reason: string; details: string | null; created_at: string;
        profiles?: { username: string } | null
      }[]).map((row) => ({
        id: row.id, communityId: row.community_id, reporterId: row.reporter_id,
        reporterUsername: row.profiles?.username ?? 'fan', messageId: row.message_id,
        reason: row.reason, details: row.details ?? '', createdAt: row.created_at,
      }))
    },
    async listEvents(communityId) {
      await requireMember(communityId)
      const { data, error } = await client()
        .from('community_events')
        .select('id, community_id, title, description, starts_at, created_by, community_event_rsvps(user_id, answer)')
        .eq('community_id', communityId)
        .order('starts_at')
      if (error) notReady(error)
      return ((data ?? []) as {
        id: string; community_id: string; title: string; description: string | null; starts_at: string; created_by: string;
        community_event_rsvps?: { user_id: string; answer: string }[] | null
      }[]).map((row) => ({
        id: row.id, communityId: row.community_id, title: row.title, description: row.description ?? '',
        startsAt: row.starts_at, createdBy: row.created_by,
        rsvps: (row.community_event_rsvps ?? []).map((rsvp) => ({
          userId: rsvp.user_id,
          answer: rsvp.answer === 'maybe' || rsvp.answer === 'no' ? rsvp.answer : 'yes' as const,
        })),
      }))
    },
    async createEvent(communityId, input) {
      await requireManager(communityId)
      const { data, error } = await client()
        .from('community_events')
        .insert({ community_id: communityId, title: input.title.trim(), description: input.description.trim().slice(0, 500), starts_at: input.startsAt, created_by: me.id })
        .select('id, community_id, title, description, starts_at, created_by')
        .single()
      if (error) notReady(error)
      const row = data as { id: string; community_id: string; title: string; description: string | null; starts_at: string; created_by: string }
      return { id: row.id, communityId: row.community_id, title: row.title, description: row.description ?? '', startsAt: row.starts_at, createdBy: row.created_by, rsvps: [] }
    },
    async rsvpEvent(eventId, answer) {
      const { error } = await client()
        .from('community_event_rsvps')
        .upsert({ event_id: eventId, user_id: me.id, answer }, { onConflict: 'event_id,user_id' })
      if (error) notReady(error)
    },
    async listVoiceRooms(communityId) {
      await requireMember(communityId)
      const { data, error } = await client()
        .from('community_voice_rooms')
        .select('id, community_id, name, created_by, created_at')
        .eq('community_id', communityId)
        .order('created_at')
      if (error) notReady(error)
      return ((data ?? []) as { id: string; community_id: string; name: string; created_by: string; created_at: string }[]).map((row) => ({
        id: row.id, communityId: row.community_id, name: row.name, createdBy: row.created_by, createdAt: row.created_at,
      }))
    },
    async createVoiceRoom(communityId, name) {
      await requireManager(communityId)
      const { data, error } = await client()
        .from('community_voice_rooms')
        .insert({ community_id: communityId, name: name.trim().slice(0, 60), created_by: me.id })
        .select('id, community_id, name, created_by, created_at')
        .single()
      if (error) notReady(error)
      const row = data as { id: string; community_id: string; name: string; created_by: string; created_at: string }
      return { id: row.id, communityId: row.community_id, name: row.name, createdBy: row.created_by, createdAt: row.created_at }
    },
  }
}
