// Athera Communities page.
//
// All seven requested areas live here, reusing the existing profile model
// (username, avatar, favourite anime) and the existing design tokens:
//  * Communities: create, public/private/invite-only, discover, join
//    requests and invite codes.
//  * Roles: owner, admin, member, pending, with manager-only actions.
//  * Channels: text and announcement channels, pinned messages, polls.
//  * Group voice rooms: see CommunityVoiceRoom, which reuses the existing
//    WebRTC TURN/ICE helpers over a Supabase Realtime broadcast channel.
//  * Events: schedule, RSVP, upcoming list.
//  * Moderation: report, mute, ban, slow mode, basic word filter.
//  * Member profiles: the same Avatar + username + favourite anime as chats.
//
// Fallback behaviour (required): in live mode the page first tries the
// Supabase communities store. If the migration has not been applied, it
// shows a banner and uses the local demo store instead, so the rest of the
// app — chats, groups, calls, settings — is never affected.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useSession } from '../context/SessionContext'
import {
  canActOnMember,
  isCommunityManager,
  pollTotalVotes,
  upcomingEvents,
  type Community,
  type CommunityChannel,
  type CommunityEvent,
  type CommunityMember,
  type CommunityMessage,
  type CommunityReport,
  type CommunityVisibility,
  type CommunityVoiceRoom as CommunityVoiceRoomData,
} from '../lib/communities'
import { fieldClass, ghostButton, primaryButton } from '../lib/styles'
import { createLocalCommunityStore, type CommunityStore } from '../services/communityStore'
import { trySupabaseCommunityStore } from '../services/communityBackend'
import { Avatar } from './Avatar'
import { CommunityVoiceRoom } from './CommunityVoiceRoom'

export function CommunitiesPage() {
  const { profile, mode } = useSession()
  const { communityId } = useParams()
  const navigate = useNavigate()
  const localStore = useMemo(() => (profile ? createLocalCommunityStore(profile) : null), [profile])
  const [store, setStore] = useState<CommunityStore | null>(localStore)
  const [fallback, setFallback] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [communities, setCommunities] = useState<Community[]>([])
  const [tab, setTab] = useState<'mine' | 'discover' | 'create'>('mine')
  const [channels, setChannels] = useState<CommunityChannel[]>([])
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null)
  const [messages, setMessages] = useState<CommunityMessage[]>([])
  const [members, setMembers] = useState<CommunityMember[]>([])
  const [events, setEvents] = useState<CommunityEvent[]>([])
  const [voiceRooms, setVoiceRooms] = useState<CommunityVoiceRoomData[]>([])
  const [reports, setReports] = useState<CommunityReport[]>([])
  const [banned, setBanned] = useState<CommunityMember[]>([])
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)
  const [codes, setCodes] = useState<Record<string, string>>({})

  const selected = communities.find((item) => item.id === communityId) ?? null
  const myRole = selected?.myRole ?? null
  const manager = isCommunityManager(myRole)

  const refresh = useCallback(async (activeStore: CommunityStore | null, selectedId?: string | null) => {
    if (!activeStore) return
    const list = await activeStore.listCommunities()
    setCommunities(list)
    const current = selectedId ? list.find((item) => item.id === selectedId) : null
    if (current && current.myRole && current.myRole !== 'pending') {
      const [chs, mems, evs, rooms] = await Promise.all([
        activeStore.listChannels(current.id),
        activeStore.listMembers(current.id),
        activeStore.listEvents(current.id),
        activeStore.listVoiceRooms(current.id),
      ])
      setChannels(chs)
      setMembers(mems)
      setEvents(evs)
      setVoiceRooms(rooms)
      setActiveChannelId((prev) => (chs.some((item) => item.id === prev) ? prev : (chs[0]?.id ?? null)))
      if (isCommunityManager(current.myRole)) {
        const [reps, bans] = await Promise.all([activeStore.listReports(current.id), activeStore.listBanned(current.id)])
        setReports(reps)
        setBanned(bans)
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function init() {
      if (!profile || !localStore) return
      setLoading(true)
      setError('')
      try {
        if (mode === 'live') {
          const live = await trySupabaseCommunityStore(profile)
          if (live && !cancelled) {
            setStore(live)
            setFallback(false)
            await refresh(live, communityId)
          } else if (!cancelled) {
            setStore(localStore)
            setFallback(true)
            await refresh(localStore, communityId)
          }
        } else {
          setStore(localStore)
          await refresh(localStore, communityId)
        }
      } catch (caught) {
        if (!cancelled) {
          setStore(localStore)
          setFallback(true)
          setError(caught instanceof Error ? caught.message : 'Communities could not be loaded.')
          try { await refresh(localStore, communityId) } catch { /* banner above already explains */ }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void init()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, profile?.id, communityId])

  useEffect(() => {
    if (!store || !activeChannelId) return
    let cancelled = false
    void store.listMessages(activeChannelId).then(
      (rows) => { if (!cancelled) setMessages(rows) },
      () => { if (!cancelled) setMessages([]) },
    )
    return () => { cancelled = true }
  }, [store, activeChannelId])

  async function run(task: () => Promise<unknown>, done?: string) {
    setError('')
    setNotice('')
    try {
      await task()
      if (done) setNotice(done)
      if (store) await refresh(store, communityId)
      if (store && activeChannelId) setMessages(await store.listMessages(activeChannelId))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not work.')
    }
  }

  async function handleCreate(input: { name: string; description: string; visibility: CommunityVisibility; favouriteAnime: string | null }) {
    if (!store) return
    setError('')
    try {
      const created = await store.createCommunity(input)
      await refresh(store, created.id)
      navigate(`/communities/${created.id}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create that community.')
    }
  }

  async function handleJoin(item: Community) {
    if (!store) return
    setError('')
    setNotice('')
    try {
      await store.joinCommunity(item.id, codes[item.id])
      const list = await store.listCommunities()
      setCommunities(list)
      const joined = list.find((entry) => entry.id === item.id)
      if (joined?.myRole === 'member' || joined?.myRole === 'owner' || joined?.myRole === 'admin') {
        navigate(`/communities/${item.id}`)
      } else {
        setNotice(item.visibility === 'public' ? 'Joined.' : 'Join request sent. An owner or admin needs to approve it.')
        await refresh(store, communityId)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not join that community.')
    }
  }

  if (!profile) return <p className="px-4 py-10 text-center text-sm text-mist">Sign in to use Communities.</p>
  if (loading) return <p className="px-4 py-10 text-center text-sm text-mist">Loading communities…</p>

  const mine = communities.filter((item) => item.myRole && item.myRole !== 'pending')
  const pending = communities.filter((item) => item.myRole === 'pending')
  const activeChannel = channels.find((item) => item.id === activeChannelId) ?? channels[0] ?? null
  const pinned = messages.filter((item) => item.pinned)

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <div className="mx-auto max-w-3xl space-y-4 pb-8">
        <header>
          <h1 className="text-xl font-semibold">Communities</h1>
          <p className="mt-1 text-sm text-mist">
            Multi-user spaces with channels, events, voice rooms and moderation. Chats and groups are unchanged.
          </p>
        </header>
        {fallback ? (
          <p className="rounded-xl border border-line bg-elevated px-3 py-2 text-sm text-mist">
            Communities are running in local demo mode: the Supabase communities migration has not been applied yet,
            so communities created here stay in this browser. Apply{' '}
            <code>supabase/migrations/20261024120000_communities.sql</code> in Supabase to share them across devices.
          </p>
        ) : null}
        {error ? <p className="rounded-xl border border-line bg-elevated px-3 py-2 text-sm text-danger">{error}</p> : null}
        {notice ? <p className="rounded-xl border border-line bg-elevated px-3 py-2 text-sm">{notice}</p> : null}

        {selected ? (
          <CommunityDetail
            community={selected}
            manager={manager}
            meId={profile.id}
            meName={profile.username}
            members={members}
            channels={channels}
            activeChannel={activeChannel}
            messages={messages}
            pinned={pinned}
            events={events}
            voiceRooms={voiceRooms}
            reports={reports}
            banned={banned}
            activeRoomId={activeRoomId}
            onSelectChannel={(id) => setActiveChannelId(id)}
            onSelectRoom={(id) => setActiveRoomId(id)}
            onRun={run}
            store={store}
          />
        ) : (
          <>
            <div className="flex gap-1 rounded-lg bg-elevated p-1" role="tablist" aria-label="Communities">
              {(['mine', 'discover', 'create'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={tab === item}
                  className={`rounded-md px-3 py-1 text-xs font-medium ${tab === item ? 'bg-panel text-paper shadow-sm' : 'text-mist hover:text-paper'}`}
                  onClick={() => setTab(item)}
                >
                  {item === 'mine' ? 'My communities' : item === 'discover' ? 'Discover' : 'Create'}
                </button>
              ))}
            </div>
            {tab === 'create' ? (
              <CreateCommunityForm onCreate={(input) => void handleCreate(input)} />
            ) : (
              <ul className="space-y-2">
                {(tab === 'mine' ? mine : communities).length === 0 ? (
                  <p className="py-6 text-center text-sm text-mist">
                    {tab === 'mine' ? 'You are not in a community yet. Discover one, or create your own.' : 'No communities to discover yet.'}
                  </p>
                ) : null}
                {(tab === 'mine' ? mine : communities).map((item) => (
                  <li key={item.id} className="rounded-xl border border-line bg-panel p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Link to={`/communities/${item.id}`} className="text-sm font-semibold hover:underline">{item.name}</Link>
                        <p className="mt-0.5 text-sm text-mist">{item.description || 'No description yet.'}</p>
                        <p className="mt-1 text-xs text-mist">
                          {item.visibility} · {item.memberCount} member{item.memberCount === 1 ? '' : 's'}
                          {item.favouriteAnime ? ` · ${item.favouriteAnime}` : ''}
                          {item.myRole ? ` · you are ${item.myRole}` : ''}
                        </p>
                      </div>
                      {item.myRole ? null : (
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          {item.visibility === 'invite-only' ? (
                            <input
                              className={`${fieldClass} !w-32 !py-1.5 text-xs`}
                              placeholder="Invite code"
                              value={codes[item.id] ?? ''}
                              onChange={(event) => setCodes((prev) => ({ ...prev, [item.id]: event.target.value }))}
                              aria-label={`Invite code for ${item.name}`}
                            />
                          ) : null}
                          <button type="button" className={primaryButton} onClick={() => void handleJoin(item)}>
                            {item.visibility === 'private' ? 'Request to join' : 'Join'}
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {pending.length > 0 ? (
              <section>
                <h2 className="text-sm font-semibold">Join requests pending</h2>
                <ul className="mt-2 space-y-2">
                  {pending.map((item) => (
                    <li key={item.id} className="rounded-xl border border-line bg-panel p-3 text-sm">
                      <span className="font-medium">{item.name}</span>
                      <span className="text-mist"> — waiting for an owner or admin to approve you.</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

function CreateCommunityForm({ onCreate }: {
  onCreate: (input: { name: string; description: string; visibility: CommunityVisibility; favouriteAnime: string | null }) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<CommunityVisibility>('public')
  const [favouriteAnime, setFavouriteAnime] = useState('')
  return (
    <form
      className="space-y-3 rounded-xl border border-line bg-panel p-3"
      onSubmit={(event) => {
        event.preventDefault()
        onCreate({ name, description, visibility, favouriteAnime: favouriteAnime.trim() || null })
      }}
    >
      <p className="text-sm text-mist">Creating a community also creates #general and #announcements channels, and makes you its owner.</p>
      <input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} placeholder="Community name" aria-label="Community name" />
      <textarea className={fieldClass} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description (optional)" aria-label="Community description" />
      <input className={fieldClass} value={favouriteAnime} onChange={(event) => setFavouriteAnime(event.target.value)} placeholder="Favourite anime tag (optional)" aria-label="Favourite anime tag" />
      <label className="block text-sm">
        <span className="text-mist">Visibility</span>
        <select className={`${fieldClass} mt-1`} value={visibility} onChange={(event) => setVisibility(event.target.value as CommunityVisibility)}>
          <option value="public">Public — anyone can discover and join</option>
          <option value="private">Private — anyone can request to join</option>
          <option value="invite-only">Invite-only — needs the invite code</option>
        </select>
      </label>
      <button type="submit" className={primaryButton}>Create community</button>
    </form>
  )
}

function CommunityDetail(props: {
  community: Community
  manager: boolean
  meId: string
  meName: string
  members: CommunityMember[]
  channels: CommunityChannel[]
  activeChannel: CommunityChannel | null
  messages: CommunityMessage[]
  pinned: CommunityMessage[]
  events: CommunityEvent[]
  voiceRooms: CommunityVoiceRoomData[]
  reports: CommunityReport[]
  banned: CommunityMember[]
  activeRoomId: string | null
  onSelectChannel: (id: string) => void
  onSelectRoom: (id: string) => void
  onRun: (task: () => Promise<unknown>, done?: string) => Promise<void>
  store: CommunityStore | null
}) {
  const { community, manager, meId, members, channels, activeChannel, messages, pinned, events, voiceRooms, reports, banned, activeRoomId, store } = props
  const [messageText, setMessageText] = useState('')
  const [channelName, setChannelName] = useState('')
  const [channelKind, setChannelKind] = useState<'text' | 'announcements'>('text')
  const [pollQuestion, setPollQuestion] = useState('')
  const [pollOptions, setPollOptions] = useState(['', ''])
  const [eventTitle, setEventTitle] = useState('')
  const [eventDescription, setEventDescription] = useState('')
  const [eventStartsAt, setEventStartsAt] = useState('')
  const [roomName, setRoomName] = useState('')
  const [slowMode, setSlowMode] = useState(community.slowModeSeconds)
  const [filterText, setFilterText] = useState(community.wordFilter.join(', '))
  const [reportingId, setReportingId] = useState<string | null>(null)
  const [reportReason, setReportReason] = useState('Spam')
  const [reportDetails, setReportDetails] = useState('')

  if (community.myRole === 'pending') {
    return (
      <div className="rounded-xl border border-line bg-panel p-3 text-sm">
        <p className="font-semibold">{community.name}</p>
        <p className="mt-1 text-mist">Your join request is pending. An owner or admin needs to approve it before you can see channels, events or voice rooms.</p>
        <Link to="/communities" className="mt-3 inline-block text-sakura hover:underline">Back to communities</Link>
      </div>
    )
  }
  if (!community.myRole) {
    return (
      <div className="rounded-xl border border-line bg-panel p-3 text-sm">
        <p className="font-semibold">{community.name}</p>
        <p className="mt-1 text-mist">Join this community from the Discover list to see its channels and events.</p>
        <Link to="/communities" className="mt-3 inline-block text-sakura hover:underline">Back to communities</Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <Link to="/communities" className="text-sm text-sakura hover:underline">← Back to communities</Link>
        <h2 className="mt-2 text-lg font-semibold">{community.name}</h2>
        <p className="text-sm text-mist">{community.description || 'No description yet.'}</p>
        <p className="mt-1 text-xs text-mist">
          {community.visibility} · {community.memberCount} members · you are {community.myRole}
          {manager && community.inviteCode ? ` · invite code: ${community.inviteCode}` : ''}
        </p>
      </div>

      <section className="rounded-xl border border-line bg-panel p-3">
        <h3 className="text-sm font-semibold">Channels</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {channels.map((channel) => (
            <button
              key={channel.id}
              type="button"
              className={`rounded-lg border px-3 py-1.5 text-sm ${activeChannel?.id === channel.id ? 'border-sakura bg-elevated' : 'border-line'}`}
              onClick={() => props.onSelectChannel(channel.id)}
            >
              #{channel.name}{channel.kind === 'announcements' ? ' 📣' : ''}
            </button>
          ))}
        </div>
        {manager ? (
          <form
            className="mt-3 flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              if (!store) return
              void props.onRun(() => store.createChannel(community.id, channelName, channelKind), 'Channel created.')
              setChannelName('')
            }}
          >
            <input className={`${fieldClass} !w-48`} value={channelName} onChange={(event) => setChannelName(event.target.value)} placeholder="new-channel" aria-label="New channel name" />
            <select className={`${fieldClass} !w-40`} value={channelKind} onChange={(event) => setChannelKind(event.target.value as 'text' | 'announcements')}>
              <option value="text">Text</option>
              <option value="announcements">Announcements</option>
            </select>
            <button type="submit" className={ghostButton}>Add channel</button>
          </form>
        ) : null}
      </section>

      {activeChannel ? (
        <section className="rounded-xl border border-line bg-panel p-3">
          <h3 className="text-sm font-semibold">#{activeChannel.name}</h3>
          {pinned.length > 0 ? (
            <div className="mt-2 space-y-1 rounded-lg bg-elevated p-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-mist">Pinned</p>
              {pinned.map((item) => (
                <p key={item.id} className="text-sm"><span className="font-medium">@{item.senderUsername}:</span> {item.body}</p>
              ))}
            </div>
          ) : null}
          <ul className="mt-3 space-y-3">
            {messages.length === 0 ? <li className="text-sm text-mist">No messages yet.</li> : null}
            {messages.map((item) => (
              <li key={item.id} className="flex gap-2">
                <Avatar name={item.senderUsername} url={item.senderAvatarUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-semibold">@{item.senderUsername}</span>
                    {item.senderFavouriteAnime ? <span className="text-mist"> · {item.senderFavouriteAnime}</span> : null}
                    {item.pinned ? <span className="text-mist"> · pinned</span> : null}
                  </p>
                  <p className="text-sm">{item.body}</p>
                  {item.poll ? (
                    <div className="mt-1 space-y-1">
                      {item.poll.map((option, index) => (
                        <button
                          key={option.text}
                          type="button"
                          className="block w-full rounded-lg border border-line px-2 py-1 text-left text-xs hover:bg-elevated"
                          onClick={() => {
                            if (!store) return
                            void props.onRun(() => store.votePoll(item.id, index))
                          }}
                        >
                          {option.text} — {option.votes.length} vote{option.votes.length === 1 ? '' : 's'}
                          {option.votes.includes(meId) ? ' · your vote' : ''}
                        </button>
                      ))}
                      <p className="text-xs text-mist">{pollTotalVotes(item.poll)} total votes</p>
                    </div>
                  ) : null}
                  <div className="mt-1 flex gap-2 text-xs">
                    {manager ? (
                      <button type="button" className="text-mist hover:underline" onClick={() => {
                        if (!store) return
                        void props.onRun(() => store.togglePin(item.id))
                      }}>
                        {item.pinned ? 'Unpin' : 'Pin'}
                      </button>
                    ) : null}
                    <button type="button" className="text-mist hover:underline" onClick={() => setReportingId(item.id)}>Report</button>
                  </div>
                  {reportingId === item.id ? (
                    <form
                      className="mt-2 space-y-2 rounded-lg bg-elevated p-2"
                      onSubmit={(event) => {
                        event.preventDefault()
                        if (!store) return
                        void props.onRun(() => store.reportMessage(community.id, item.id, reportReason, reportDetails), 'Report sent.')
                        setReportingId(null)
                        setReportDetails('')
                      }}
                    >
                      <select className={fieldClass} value={reportReason} onChange={(event) => setReportReason(event.target.value)}>
                        <option>Spam</option><option>Harassment</option><option>Impersonation</option><option>Other</option>
                      </select>
                      <input className={fieldClass} value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} placeholder="Details (optional)" aria-label="Report details" />
                      <button type="submit" className={ghostButton}>Send report</button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              if (!store || !activeChannel) return
              void props.onRun(() => store.sendMessage(activeChannel.id, messageText), undefined)
              setMessageText('')
            }}
          >
            <input className={fieldClass} value={messageText} onChange={(event) => setMessageText(event.target.value)} placeholder="Message this channel" aria-label="Channel message" />
            <button type="submit" className={primaryButton}>Send</button>
          </form>
          <form
            className="mt-3 space-y-2 rounded-lg bg-elevated p-2"
            onSubmit={(event) => {
              event.preventDefault()
              if (!store || !activeChannel) return
              void props.onRun(() => store.createPoll(activeChannel.id, pollQuestion, pollOptions), 'Poll created.')
              setPollQuestion('')
              setPollOptions(['', ''])
            }}
          >
            <p className="text-xs font-semibold">Create a poll</p>
            <input className={fieldClass} value={pollQuestion} onChange={(event) => setPollQuestion(event.target.value)} placeholder="Poll question" aria-label="Poll question" />
            {pollOptions.map((option, index) => (
              <input
                key={index}
                className={fieldClass}
                value={option}
                onChange={(event) => setPollOptions((prev) => prev.map((item, i) => (i === index ? event.target.value : item)))}
                placeholder={`Option ${index + 1}`}
                aria-label={`Poll option ${index + 1}`}
              />
            ))}
            <div className="flex gap-2">
              <button type="button" className={ghostButton} onClick={() => setPollOptions((prev) => (prev.length < 5 ? [...prev, ''] : prev))}>Add option</button>
              <button type="submit" className={primaryButton}>Post poll</button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="rounded-xl border border-line bg-panel p-3">
        <h3 className="text-sm font-semibold">Voice rooms</h3>
        <p className="mt-1 text-xs text-mist">Group voice rooms use the existing WebRTC helpers. Small rooms work as a peer mesh; very large rooms will need a media server later.</p>
        <div className="mt-2 space-y-2">
          {voiceRooms.map((room) => (
            <div key={room.id}>
              <button type="button" className="w-full rounded-lg border border-line px-3 py-2 text-left text-sm hover:bg-elevated" onClick={() => props.onSelectRoom(activeRoomId === room.id ? '' : room.id)}>
                🎙 {room.name}
              </button>
              {activeRoomId === room.id ? (
                <div className="mt-2">
                  <CommunityVoiceRoom room={room} meId={meId} meName={props.meName} />
                </div>
              ) : null}
            </div>
          ))}
        </div>
        {manager ? (
          <form
            className="mt-3 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              if (!store) return
              void props.onRun(() => store.createVoiceRoom(community.id, roomName), 'Voice room created.')
              setRoomName('')
            }}
          >
            <input className={fieldClass} value={roomName} onChange={(event) => setRoomName(event.target.value)} placeholder="New voice room" aria-label="New voice room" />
            <button type="submit" className={ghostButton}>Add room</button>
          </form>
        ) : null}
      </section>

      <section className="rounded-xl border border-line bg-panel p-3">
        <h3 className="text-sm font-semibold">Events</h3>
        {upcomingEvents(events).length === 0 ? <p className="mt-1 text-sm text-mist">No upcoming events.</p> : null}
        <ul className="mt-2 space-y-2">
          {upcomingEvents(events).map((event) => (
            <li key={event.id} className="rounded-lg border border-line p-2">
              <p className="text-sm font-medium">{event.title}</p>
              <p className="text-xs text-mist">{new Date(event.startsAt).toLocaleString()} · {event.rsvps.filter((item) => item.answer === 'yes').length} going · {event.rsvps.filter((item) => item.answer === 'maybe').length} maybe</p>
              {event.description ? <p className="mt-1 text-sm">{event.description}</p> : null}
              <div className="mt-2 flex gap-2">
                {(['yes', 'maybe', 'no'] as const).map((answer) => (
                  <button
                    key={answer}
                    type="button"
                    className={ghostButton}
                    onClick={() => {
                      if (!store) return
                      void props.onRun(() => store.rsvpEvent(event.id, answer))
                    }}
                  >
                    {answer === 'yes' ? 'Going' : answer === 'maybe' ? 'Maybe' : 'Can’t go'}
                    {event.rsvps.some((item) => item.userId === meId && item.answer === answer) ? ' ✓' : ''}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
        {manager ? (
          <form
            className="mt-3 space-y-2"
            onSubmit={(event) => {
              event.preventDefault()
              if (!store) return
              void props.onRun(() => store.createEvent(community.id, { title: eventTitle, description: eventDescription, startsAt: new Date(eventStartsAt).toISOString() }), 'Event created.')
              setEventTitle('')
              setEventDescription('')
              setEventStartsAt('')
            }}
          >
            <input className={fieldClass} value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} placeholder="Event title" aria-label="Event title" />
            <input className={fieldClass} value={eventDescription} onChange={(event) => setEventDescription(event.target.value)} placeholder="Event description (optional)" aria-label="Event description" />
            <input className={fieldClass} type="datetime-local" value={eventStartsAt} onChange={(event) => setEventStartsAt(event.target.value)} aria-label="Event date and time" />
            <button type="submit" className={ghostButton}>Schedule event</button>
          </form>
        ) : null}
      </section>

      <section className="rounded-xl border border-line bg-panel p-3">
        <h3 className="text-sm font-semibold">Members</h3>
        <ul className="mt-2 space-y-2">
          {members.map((member) => (
            <li key={member.id} className="flex items-center gap-3 rounded-lg border border-line p-2">
              <Avatar name={member.username} url={member.avatarUrl} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">@{member.username} · {member.role}</span>
                {member.favouriteAnime ? <span className="block text-xs text-mist">{member.favouriteAnime}</span> : null}
                {member.mutedUntil && new Date(member.mutedUntil).getTime() > Date.now() ? <span className="block text-xs text-mist">Muted until {new Date(member.mutedUntil).toLocaleString()}</span> : null}
              </span>
              {manager && canActOnMember(props.community.myRole, member, meId) ? (
                <span className="flex flex-wrap justify-end gap-1">
                  {member.role === 'pending' ? (
                    <>
                      <button type="button" className={ghostButton} onClick={() => { if (store) void props.onRun(() => store.approveMember(community.id, member.userId), 'Member approved.') }}>Approve</button>
                      <button type="button" className={ghostButton} onClick={() => { if (store) void props.onRun(() => store.declineMember(community.id, member.userId)) }}>Decline</button>
                    </>
                  ) : (
                    <>
                      <button type="button" className={ghostButton} onClick={() => { if (store) void props.onRun(() => store.setMemberRole(community.id, member.userId, member.role === 'admin' ? 'member' : 'admin')) }}>
                        {member.role === 'admin' ? 'Demote' : 'Make admin'}
                      </button>
                      <button type="button" className={ghostButton} onClick={() => { if (store) void props.onRun(() => store.muteMember(community.id, member.userId, 30), 'Member muted for 30 minutes.') }}>Mute 30m</button>
                      <button type="button" className={ghostButton} onClick={() => { if (store) void props.onRun(() => store.removeMember(community.id, member.userId)) }}>Remove</button>
                      <button type="button" className={ghostButton} onClick={() => { if (store) void props.onRun(() => store.banMember(community.id, member.userId), 'Member banned.') }}>Ban</button>
                    </>
                  )}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        {manager && banned.length > 0 ? (
          <div className="mt-3">
            <p className="text-xs font-semibold">Banned</p>
            <ul className="mt-1 space-y-1">
              {banned.map((member) => (
                <li key={member.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>@{member.username}</span>
                  <button type="button" className={ghostButton} onClick={() => { if (store) void props.onRun(() => store.unbanMember(community.id, member.userId), 'Member unbanned.') }}>Unban</button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {manager ? (
        <section className="rounded-xl border border-line bg-panel p-3">
          <h3 className="text-sm font-semibold">Moderation settings</h3>
          <form
            className="mt-2 space-y-2"
            onSubmit={(event) => {
              event.preventDefault()
              if (!store) return
              void props.onRun(async () => {
                await store.setSlowMode(community.id, slowMode)
                await store.setWordFilter(community.id, filterText.split(','))
              }, 'Moderation settings saved.')
            }}
          >
            <label className="block text-sm">
              <span className="text-mist">Slow mode (seconds between messages)</span>
              <select className={`${fieldClass} mt-1`} value={slowMode} onChange={(event) => setSlowMode(Number(event.target.value))}>
                <option value={0}>Off</option><option value={10}>10</option><option value={30}>30</option><option value={60}>60</option><option value={120}>120</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-mist">Word filter (comma-separated)</span>
              <input className={`${fieldClass} mt-1`} value={filterText} onChange={(event) => setFilterText(event.target.value)} placeholder="spam, scam" aria-label="Word filter" />
            </label>
            <button type="submit" className={ghostButton}>Save moderation settings</button>
          </form>
          {reports.length > 0 ? (
            <div className="mt-3">
              <p className="text-xs font-semibold">Reports</p>
              <ul className="mt-1 space-y-1 text-sm">
                {reports.map((report) => (
                  <li key={report.id}>@{report.reporterUsername} reported a message: {report.reason}{report.details ? ` — ${report.details}` : ''}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
