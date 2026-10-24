import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useCall } from '../context/CallContext'
import { useChat } from '../context/ChatContext'
import { useSession } from '../context/SessionContext'
import { archivedChats, chatTitle, inboxChats, isGroup } from '../lib/chatList'
import { hasPremium } from '../lib/premium'
import { TYPING_TTL_MS } from '../lib/typing'
import { cn } from '../lib/cn'
import { iconButton, primaryButton } from '../lib/styles'
import { formatListTime } from '../lib/format'
import { isOnline } from '../lib/presence'
import { receiptTick } from '../lib/receipts'
import type { Conversation, SearchPerson } from '../types'
import { Avatar } from './Avatar'
import { DisplayName } from './CreatorBadge'
import { NewGroup } from './NewGroup'
import { ReportDialog } from './ReportDialog'
import { ArchiveIcon, CheckIcon, CommunityIcon, GearIcon, PhoneIcon, PinIcon, PlusIcon, SearchIcon, MoreIcon, VolumeIcon } from './Icons'

export function Sidebar() {
  const { mode, profile } = useSession()
  const chat = useChat()
  const call = useCall()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const showRequests = params.get('requests') === '1'
  const searchRef = useRef<HTMLInputElement>(null)
  const searchSeq = useRef(0)
  const searchTimer = useRef<number | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchPerson[] | null>(null)
  const [searchError, setSearchError] = useState('')
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [menuOpen, setMenuOpen] = useState(false)
  const [plusOpen, setPlusOpen] = useState(false)
  const [groupOpen, setGroupOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [rowMenu, setRowMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [reportUser, setReportUser] = useState<SearchPerson | null>(null)
  const [typing, setTyping] = useState<Record<string, boolean>>({})
  const peers = useRef(new Map<string, string>())
  peers.current = new Map(chat.conversations.map((item) => [item.id, item.peer.id]))
  const ids = chat.conversations.map((item) => item.id).join(',')
  const subscribeTyping = useRef(chat.subscribeTyping)
  subscribeTyping.current = chat.subscribeTyping

  const conversationsRef = useRef(chat.conversations)
  conversationsRef.current = chat.conversations
  const seenMessage = useRef(new Map<string, string>())

  useEffect(() => {
    setTyping((current) => {
      let changed = false
      const next = { ...current }
      for (const conversation of conversationsRef.current) {
        const stamp = conversation.lastMessage ? `${conversation.lastMessage.senderId}:${conversation.lastMessage.createdAt}` : ''
        const previous = seenMessage.current.get(conversation.id)
        if (previous && stamp !== previous && conversation.lastMessage && conversation.lastMessage.senderId !== profile?.id && next[conversation.id]) {
          next[conversation.id] = false
          changed = true
        }
        seenMessage.current.set(conversation.id, stamp)
      }
      return changed ? next : current
    })
  }, [chat.conversations, profile?.id])

  useEffect(() => {
    const timers = new Map<string, number>()
    function clearTimer(id: string) {
      const previous = timers.get(id)
      if (previous) window.clearTimeout(previous)
      timers.delete(id)
    }
    const stops = ids.split(',').filter(Boolean).map((id) =>
      subscribeTyping.current(id, (userId, active) => {
        const conversation = conversationsRef.current.find((item) => item.id === id)
        if (conversation && isGroup(conversation)) {
          if (userId === profile?.id) return
        } else if (peers.current.get(id) !== userId) return
        if (!active) {
          clearTimer(id)
          setTyping((current) => ({ ...current, [id]: false }))
          return
        }
        setTyping((current) => ({ ...current, [id]: true }))
        clearTimer(id)
        timers.set(
          id,
          window.setTimeout(() => setTyping((current) => ({ ...current, [id]: false })), TYPING_TTL_MS),
        )
      }),
    )
    return () => {
      stops.forEach((stop) => stop())
      timers.forEach((timer) => window.clearTimeout(timer))
      setTyping({})
    }
  }, [ids, profile?.id])

  useEffect(() => () => {
    if (searchTimer.current) window.clearTimeout(searchTimer.current)
  }, [])

  function onSearch(value: string) {
    setQuery(value)
    if (searchTimer.current) window.clearTimeout(searchTimer.current)
    const seq = ++searchSeq.current
    if (!value.trim()) {
      setResults(null)
      setSearchError('')
      return
    }
    searchTimer.current = window.setTimeout(() => {
      void chat.search(value).then(
        (found) => {
          if (seq !== searchSeq.current) return
          setResults(found)
          setSearchError('')
        },
        (error: unknown) => {
          if (seq !== searchSeq.current) return
          setResults([])
          setSearchError(error instanceof Error ? error.message : 'Search failed.')
        },
      )
    }, 150)
  }

  async function runPref(id: string, patch: { pinned?: boolean; muted?: boolean; archived?: boolean }) {
    try {
      await chat.setChatPref(id, patch)
    } catch (error) {
      chat.pushToast(error instanceof Error ? error.message : 'Could not update that chat.')
    }
  }

  async function openAccepted(userId: string) {
    const id = await chat.startChat(userId)
    await chat.refresh()
    setQuery('')
    setResults(null)
    navigate(`/c/${id}`)
  }

  async function addContact(userId: string) {
    try {
      await chat.requestContact(userId)
      setResults(await chat.search(query))
      setSearchError('')
      chat.pushToast('Contact request sent')
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'Could not send the request.')
    }
  }

  const archived = archivedChats(chat.conversations)
  const inbox = inboxChats(chat.conversations).filter((item) => filter === 'all' || item.unread > 0)
  const archivedVisible = archived.filter((item) => filter === 'all' || item.unread > 0)
  const visible = archiveOpen ? archivedVisible : inbox
  const chatNeedle = query.trim().toLowerCase().replace(/^@+/, '')
  const listed = chatNeedle
    ? visible.filter((item) => chatTitle(item).toLowerCase().includes(chatNeedle))
    : visible
  const contacts = chat.conversations
    .filter((item) => !isGroup(item) && !item.blocked)
    .map((item) => item.peer)
    .filter((person, index, list) => list.findIndex((item) => item.id === person.id) === index)

  return (
    <div className="chat-list relative flex h-full min-h-0 flex-col bg-panel">
      <header className="chat-header flex h-14 items-center gap-2 px-3">
        <h1 className="min-w-0 flex-1 text-lg font-semibold tracking-tight">{showRequests ? 'Requests' : 'Chats'}</h1>
        <Link
          to={showRequests ? '/' : '/?requests=1'}
          className="relative grid h-9 place-items-center rounded-lg px-2 text-sm font-medium text-mist hover:text-paper md:hidden"
          aria-label={chat.incomingRequests > 0 ? `Requests, ${chat.incomingRequests} incoming` : 'Requests'}
        >
          {showRequests ? 'Chats' : 'Requests'}
          {!showRequests && chat.incomingRequests > 0 ? (
            <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-sakura px-1 text-[10px] font-semibold text-white">
              {chat.incomingRequests}
            </span>
          ) : null}
        </Link>
        <button
          type="button"
          className={iconButton}
          aria-label="New chat"
          aria-expanded={plusOpen}
          onClick={() => setPlusOpen((open) => !open)}
        >
          <PlusIcon className="h-5 w-5" />
        </button>
        <button
          type="button"
          className={iconButton}
          aria-label="Chat list menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <MoreIcon className="h-5 w-5" />
        </button>
      </header>
      {plusOpen ? (
        <div className="absolute right-14 top-12 z-30 w-44 rounded-xl border border-line bg-panel p-1 shadow-md" role="menu">
          <button
            type="button"
            role="menuitem"
            className="hover-wash block w-full rounded-lg px-3 py-2 text-left text-sm"
            onClick={() => {
              setPlusOpen(false)
              setGroupOpen(false)
              searchRef.current?.focus()
            }}
          >
            New chat
          </button>
          <button
            type="button"
            role="menuitem"
            className="hover-wash block w-full rounded-lg px-3 py-2 text-left text-sm"
            onClick={() => {
              setPlusOpen(false)
              setArchiveOpen(false)
              setGroupOpen(true)
            }}
          >
            New group
          </button>
        </div>
      ) : null}
      {menuOpen ? (
        <div className="absolute right-3 top-12 z-30 w-48 rounded-xl border border-line bg-panel p-1 shadow-md" role="menu">
          <Link to="/settings" className="hover-wash flex items-center gap-2 rounded-lg px-3 py-2 text-sm" onClick={() => setMenuOpen(false)}>
            <GearIcon className="h-4 w-4" />
            Settings
          </Link>
          <Link to="/communities" className="hover-wash flex items-center gap-2 rounded-lg px-3 py-2 text-sm" onClick={() => setMenuOpen(false)}>
            <CommunityIcon className="h-4 w-4" />
            Communities
          </Link>
          {mode === 'demo' ? (
            <button
              type="button"
              className="hover-wash flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm"
              onClick={() => {
                const target = chat.conversations.find((item) => item.peer.username === 'sakura') ?? chat.conversations[0]
                if (target) call.simulateIncoming(target.peer, target.id)
                setMenuOpen(false)
              }}
            >
              <PhoneIcon className="h-4 w-4" />
              Preview call
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="px-3">
        <label className="relative block">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist" />
          <input
            ref={searchRef}
            className="h-10 w-full rounded-lg border border-line bg-elevated pl-9 pr-3 text-sm text-paper outline-none transition placeholder:text-mist/70 focus:border-sakura focus:ring-2 focus:ring-sakura/30"
            value={query}
            onChange={(event) => void onSearch(event.target.value)}
            placeholder="Search username"
            aria-label="Search username"
          />
        </label>
        <div className="mt-2 flex gap-1 rounded-lg bg-elevated p-1" role="tablist" aria-label="Chat filters">
          {(['all', 'unread'] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={filter === item}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-medium transition',
                filter === item ? 'bg-panel text-paper shadow-sm' : 'text-mist hover:text-paper',
              )}
              onClick={() => setFilter(item)}
            >
              {item === 'all' ? 'All' : 'Unread'}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {groupOpen ? (
          <NewGroup
            contacts={contacts}
            onClose={() => setGroupOpen(false)}
            onCreate={async (title, memberIds) => {
              const id = await chat.createGroup(title, memberIds)
              setGroupOpen(false)
              navigate(`/c/${id}`)
            }}
          />
        ) : showRequests ? (
          <RequestsPanel
            meId={profile?.id ?? ''}
            onAccept={async (id) => {
              const conversationId = await chat.acceptRequest(id)
              navigate(`/c/${conversationId}`)
            }}
            onDecline={(id) => chat.declineRequest(id)}
            onCancel={(id) => chat.cancelRequest(id)}
          />
        ) : results ? (
          <div data-username-search="true">
            {searchError ? <p className="px-4 py-3 text-sm text-danger">{searchError}</p> : null}
            {results.length === 0 && !searchError ? <p className="px-4 py-3 text-center text-sm text-mist" data-search-empty="true">Type the full username.</p> : null}
            {results.map((person) => (
              <article key={person.id} className="mx-3 my-2 rounded-xl border border-line bg-panel p-3 shadow-sm">
                <div className="flex items-center gap-3">
                  <Avatar name={person.username} url={person.avatarUrl} size="sm" creator={person.isCreator} premium={hasPremium(person)} />
                  <span className="min-w-0">
                    <DisplayName name={`@${person.username}`} creator={person.isCreator} premium={hasPremium(person)} className="text-sm font-semibold" />
                    {person.favouriteAnime ? <span className="block truncate text-xs text-mist">{person.favouriteAnime}</span> : null}
                  </span>
                </div>
                <div className="mt-3 flex gap-2">
                  <PersonActions
                    person={person}
                    meId={profile?.id ?? ''}
                    onAdd={() => addContact(person.id)}
                    onMessage={() => openAccepted(person.id)}
                    onAccept={async () => {
                      if (!person.requestId) return
                      const conversationId = await chat.acceptRequest(person.requestId)
                      setQuery('')
                      setResults(null)
                      navigate(`/c/${conversationId}`)
                    }}
                    onDecline={async () => {
                      if (!person.requestId) return
                      await chat.declineRequest(person.requestId)
                      setResults(await chat.search(query))
                    }}
                    onCancel={async () => {
                      if (!person.requestId) return
                      await chat.cancelRequest(person.requestId)
                      setResults(await chat.search(query))
                    }}
                    blocked={chat.conversations.some((item) => !isGroup(item) && item.peer.id === person.id && item.blockedByMe)}
                    onBlock={async () => {
                      await chat.blockUser(person.id)
                      chat.pushToast(`Blocked @${person.username}`)
                      setResults(await chat.search(query))
                    }}
                    onUnblock={async () => {
                      await chat.unblockUser(person.id)
                      chat.pushToast(`Unblocked @${person.username}`)
                    }}
                    onReport={() => setReportUser(person)}
                  />
                </div>
              </article>
            ))}
          </div>
        ) : null}
        {groupOpen || showRequests ? null : chat.loading && !results ? (
          <ListSkeleton />
        ) : listed.length === 0 && !results && (archiveOpen || archived.length === 0) ? (
          <p className="px-4 py-10 text-center text-sm leading-6 text-mist">
            {archiveOpen ? 'No archived chats.' : filter === 'unread' ? 'No unread chats.' : 'No chats yet. Search a username to send a contact request.'}
          </p>
        ) : listed.length === 0 ? null : (
          <ul>
            {archiveOpen ? (
              <li>
                <button type="button" className="flex w-full items-center gap-3 border-b border-line/70 px-3 py-2.5 text-left text-sm font-medium" onClick={() => setArchiveOpen(false)}>
                  Back to chats
                </button>
              </li>
            ) : archived.length > 0 && !chatNeedle ? (
              <li>
                <button type="button" className="flex w-full items-center gap-3 border-b border-line/70 px-3 py-2.5 text-left" onClick={() => setArchiveOpen(true)}>
                  <ArchiveIcon className="h-5 w-5 text-mist" />
                  <span className="min-w-0 flex-1 text-sm font-medium">Archived</span>
                  <span className="text-xs text-mist">{archived.length}</span>
                </button>
              </li>
            ) : null}
            {listed.map((conversation) => (
              <ChatRow
                key={conversation.id}
                conversation={conversation}
                active={chat.activeId === conversation.id}
                mine={conversation.lastMessage?.senderId === profile?.id}
                typing={Boolean(typing[conversation.id])}
                onOpenMenu={(x, y) => setRowMenu({ id: conversation.id, x, y })}
              />
            ))}
          </ul>
        )}
        {chat.error ? <p className="px-4 py-2 text-sm text-danger">{chat.error}</p> : null}
      </div>
      <footer className="shrink-0 px-3 pb-4 pt-3 text-center text-xs leading-4 text-mist">
        Created by{' '}
        <a
          href="https://github.com/taha080"
          target="_blank"
          rel="noreferrer noopener"
          className="text-mist underline-offset-2 hover:underline"
        >
          Taha Ahsan
        </a>
      </footer>
      {rowMenu ? (
        <ChatRowMenu
          conversation={chat.conversations.find((item) => item.id === rowMenu.id)}
          x={rowMenu.x}
          y={rowMenu.y}
          onClose={() => setRowMenu(null)}
          onPin={() => runPref(rowMenu.id, { pinned: !chat.conversations.find((item) => item.id === rowMenu.id)?.pinned })}
          onMute={() => runPref(rowMenu.id, { muted: !chat.conversations.find((item) => item.id === rowMenu.id)?.muted })}
          onArchive={() => runPref(rowMenu.id, { archived: !chat.conversations.find((item) => item.id === rowMenu.id)?.archived })}
        />
      ) : null}
      {reportUser ? (
        <ReportDialog
          username={reportUser.username}
          onClose={() => setReportUser(null)}
          onSubmit={async (reason, details) => {
            await chat.reportUser(reportUser.id, reason, details, null)
            chat.pushToast('Report sent')
          }}
        />
      ) : null}
    </div>
  )
}

function ChatRow({
  conversation,
  active,
  mine,
  typing,
  onOpenMenu,
}: {
  conversation: Conversation
  active: boolean
  mine: boolean
  typing: boolean
  onOpenMenu: (x: number, y: number) => void
}) {
  const group = isGroup(conversation)
  const title = chatTitle(conversation)
  const tick = conversation.lastMessage && mine ? receiptTick(conversation.lastMessage, conversation.peer.showReadReceipts !== false) : null
  const preview = typing ? 'typing…' : conversation.lastMessage?.body ?? 'No messages yet'
  const suppress = useRef(false)
  const cancelPress = useRef<(() => void) | null>(null)

  useEffect(() => () => cancelPress.current?.(), [])

  function openMenu(x: number, y: number) {
    suppress.current = true
    onOpenMenu(Math.min(x, window.innerWidth - 180), Math.min(y, window.innerHeight - 160))
  }

  function onPointerDown(event: ReactPointerEvent<HTMLAnchorElement>) {
    if (event.button !== 0) return
    const startX = event.clientX
    const startY = event.clientY
    const timer = window.setTimeout(() => openMenu(startX, startY), 450)
    function stop() {
      window.clearTimeout(timer)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
      window.removeEventListener('pointermove', move)
      cancelPress.current = null
    }
    function move(moveEvent: PointerEvent) {
      if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) > 12) stop()
    }
    cancelPress.current = stop
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    window.addEventListener('pointermove', move)
  }

  return (
    <li>
      <Link
        to={`/c/${conversation.id}`}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex items-center gap-3 border-b border-line/70 px-3 py-2.5 transition',
          active ? 'is-active bg-[color-mix(in_oklab,var(--accent)_14%,transparent)]' : 'hover-wash',
        )}
        onPointerDown={onPointerDown}
        onClick={(event) => {
          if (!suppress.current) return
          event.preventDefault()
          suppress.current = false
        }}
        onContextMenu={(event) => {
          event.preventDefault()
          openMenu(event.clientX, event.clientY)
        }}
      >
        <Avatar
          name={title}
          url={group ? conversation.photoUrl ?? null : conversation.peer.avatarUrl}
          online={group ? false : isOnline(conversation.peer.lastSeenAt)}
          creator={group ? false : conversation.peer.isCreator}
          premium={group ? false : hasPremium(conversation.peer)}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1">
              <DisplayName
                name={title}
                creator={group ? false : conversation.peer.isCreator}
                premium={group ? false : hasPremium(conversation.peer)}
                className={cn('text-sm', conversation.unread > 0 ? 'font-semibold' : 'font-medium')}
              />
              {conversation.pinned ? (
                <span role="img" aria-label="Pinned">
                  <PinIcon className="h-3.5 w-3.5 shrink-0 text-mist" />
                </span>
              ) : null}
            </span>
            {conversation.lastMessage ? (
              <time className={cn('shrink-0 text-[11px]', conversation.unread > 0 ? 'text-sakura' : 'text-mist')} dateTime={conversation.lastMessage.createdAt}>
                {formatListTime(conversation.lastMessage.createdAt)}
              </time>
            ) : null}
          </span>
          <span className="mt-0.5 flex items-center justify-between gap-2">
            <span className={cn('flex min-w-0 items-center gap-1 text-sm', typing ? 'text-foam' : 'text-mist')}>
              {conversation.muted ? (
                <span role="img" aria-label="Muted">
                  <VolumeIcon className="h-3.5 w-3.5 shrink-0" off />
                </span>
              ) : null}
              {tick ? <CheckIcon className={cn('h-3.5 w-3.5 shrink-0', tick === 'seen' ? 'text-sakura' : '')} double={tick !== 'sent'} /> : null}
              <span className="truncate">{preview}</span>
            </span>
            {conversation.unread > 0 ? (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-sakura px-1.5 text-[11px] font-semibold text-white">
                {conversation.unread}
              </span>
            ) : null}
          </span>
        </span>
      </Link>
    </li>
  )
}

function ChatRowMenu({
  conversation,
  x,
  y,
  onClose,
  onPin,
  onMute,
  onArchive,
}: {
  conversation: Conversation | undefined
  x: number
  y: number
  onClose: () => void
  onPin: () => Promise<void>
  onMute: () => Promise<void>
  onArchive: () => Promise<void>
}) {
  useEffect(() => {
    function close() {
      onClose()
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  if (!conversation) return null
  async function choose(task: () => Promise<void>) {
    await task()
    onClose()
  }
  return (
    <div
      className="fixed z-40 w-44 rounded-xl border border-line bg-panel p-1 shadow-md"
      style={{ left: x, top: y }}
      role="menu"
      aria-label="Chat actions"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button type="button" role="menuitem" className="hover-wash block w-full rounded-lg px-3 py-2 text-left text-sm" onClick={() => void choose(onPin)}>
        {conversation.pinned ? 'Unpin' : 'Pin'}
      </button>
      <button type="button" role="menuitem" className="hover-wash block w-full rounded-lg px-3 py-2 text-left text-sm" onClick={() => void choose(onMute)}>
        {conversation.muted ? 'Unmute' : 'Mute'}
      </button>
      <button type="button" role="menuitem" className="hover-wash block w-full rounded-lg px-3 py-2 text-left text-sm" onClick={() => void choose(onArchive)}>
        {conversation.archived ? 'Unarchive' : 'Archive'}
      </button>
    </div>
  )
}

function PersonActions({
  person,
  meId,
  onAdd,
  onMessage,
  onAccept,
  onDecline,
  onCancel,
  blocked,
  onBlock,
  onUnblock,
  onReport,
}: {
  person: SearchPerson
  meId: string
  onAdd: () => Promise<void>
  onMessage: () => Promise<void>
  onAccept: () => Promise<void>
  onDecline: () => Promise<void>
  onCancel: () => Promise<void>
  blocked: boolean
  onBlock: () => Promise<void>
  onUnblock: () => Promise<void>
  onReport: () => void
}) {
  const incoming = person.requestStatus === 'pending' && person.requestFromId !== meId
  const outgoing = person.requestStatus === 'pending' && person.requestFromId === meId
  const safety = (
    <>
      <button type="button" className="h-9 rounded-lg border border-line px-3 text-xs font-medium text-paper" onClick={() => void (blocked ? onUnblock() : onBlock())}>
        {blocked ? 'Unblock' : 'Block'}
      </button>
      <button type="button" className="h-9 rounded-lg border border-line px-3 text-xs font-medium text-paper" onClick={onReport}>
        Report
      </button>
    </>
  )
  if (person.requestStatus === 'accepted') {
    return (
      <>
        <button type="button" className={`${primaryButton} h-9 px-3 text-xs`} onClick={() => void onMessage()}>
          Message
        </button>
        {safety}
      </>
    )
  }
  if (incoming) {
    return (
      <>
        <button type="button" className={`${primaryButton} h-9 px-3 text-xs`} onClick={() => void onAccept()}>
          Accept
        </button>
        <button type="button" className="h-9 rounded-lg border border-line px-3 text-xs font-medium text-paper" onClick={() => void onDecline()}>
          Decline
        </button>
        {safety}
      </>
    )
  }
  if (outgoing) {
    return (
      <>
        <button type="button" className="h-9 rounded-lg border border-line px-3 text-xs font-medium text-mist" onClick={() => void onCancel()}>
          Request sent
        </button>
        {safety}
      </>
    )
  }
  return (
    <>
      <button type="button" className={`${primaryButton} h-9 px-3 text-xs`} onClick={() => void onAdd()}>
        Send request
      </button>
      {safety}
    </>
  )
}

function RequestsPanel({
  meId,
  onAccept,
  onDecline,
  onCancel,
}: {
  meId: string
  onAccept: (id: string) => Promise<void>
  onDecline: (id: string) => Promise<void>
  onCancel: (id: string) => Promise<void>
}) {
  const { requests } = useChat()
  const incoming = requests.filter((request) => request.toId === meId)
  const outgoing = requests.filter((request) => request.fromId === meId)
  return (
    <div className="space-y-5 px-3 py-3">
      <section aria-label="Incoming requests">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-mist">Incoming</h2>
        {incoming.length === 0 ? <p className="mt-2 text-sm text-mist">No incoming requests.</p> : null}
        <ul className="mt-2 space-y-2">
          {incoming.map((request) => (
            <li key={request.id} className="rounded-xl border border-line bg-panel p-3 shadow-sm">
              <div className="flex items-center gap-3">
                <Avatar name={request.peer.username} url={request.peer.avatarUrl} size="sm" creator={request.peer.isCreator} premium={hasPremium(request.peer)} />
                <DisplayName name={request.peer.username} creator={request.peer.isCreator} premium={hasPremium(request.peer)} className="text-sm font-semibold" />
              </div>
              <div className="mt-3 flex gap-2">
                <button type="button" className={`${primaryButton} h-9 px-3 text-xs`} onClick={() => void onAccept(request.id)}>
                  Accept
                </button>
                <button type="button" className="h-9 rounded-lg border border-line px-3 text-xs font-medium" onClick={() => void onDecline(request.id)}>
                  Decline
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="Outgoing requests">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-mist">Outgoing</h2>
        {outgoing.length === 0 ? <p className="mt-2 text-sm text-mist">No pending requests.</p> : null}
        <ul className="mt-2 space-y-2">
          {outgoing.map((request) => (
            <li key={request.id} className="flex items-center gap-3 rounded-xl border border-line bg-panel p-3 shadow-sm">
              <Avatar name={request.peer.username} url={request.peer.avatarUrl} size="sm" creator={request.peer.isCreator} premium={hasPremium(request.peer)} />
              <span className="min-w-0 flex-1">
                <DisplayName name={request.peer.username} creator={request.peer.isCreator} premium={hasPremium(request.peer)} className="text-sm font-semibold" />
                <span className="text-xs text-mist">Pending</span>
              </span>
              <button type="button" className="h-9 rounded-lg border border-line px-3 text-xs font-medium" onClick={() => void onCancel(request.id)}>
                Cancel
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function ListSkeleton() {
  return (
    <div aria-hidden="true">
      {Array.from({ length: 7 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 border-b border-line/60 px-3 py-3">
          <span className="skeleton h-12 w-12 rounded-full" />
          <span className="min-w-0 flex-1 space-y-2">
            <span className="skeleton block h-3 w-2/5 rounded" />
            <span className="skeleton block h-3 w-4/5 rounded" />
          </span>
        </div>
      ))}
    </div>
  )
}
