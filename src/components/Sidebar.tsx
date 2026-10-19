import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useCall } from '../context/CallContext'
import { useChat } from '../context/ChatContext'
import { useSession } from '../context/SessionContext'
import { cn } from '../lib/cn'
import { iconButton, primaryButton } from '../lib/styles'
import { formatListTime } from '../lib/format'
import { isOnline } from '../lib/presence'
import { receiptTick } from '../lib/receipts'
import type { SearchPerson } from '../types'
import { Avatar } from './Avatar'
import { DisplayName } from './CreatorBadge'
import { CheckIcon, GearIcon, PhoneIcon, PlusIcon, SearchIcon, MoreIcon } from './Icons'

export function Sidebar() {
  const { mode, profile } = useSession()
  const chat = useChat()
  const call = useCall()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const showRequests = params.get('requests') === '1'
  const searchRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchPerson[] | null>(null)
  const [searchError, setSearchError] = useState('')
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [menuOpen, setMenuOpen] = useState(false)
  const [typing, setTyping] = useState<Record<string, boolean>>({})
  const peers = useRef(new Map<string, string>())
  peers.current = new Map(chat.conversations.map((item) => [item.id, item.peer.id]))
  const ids = chat.conversations.map((item) => item.id).join(',')
  const subscribeTyping = useRef(chat.subscribeTyping)
  subscribeTyping.current = chat.subscribeTyping

  useEffect(() => {
    const timers = new Map<string, number>()
    const stops = ids.split(',').filter(Boolean).map((id) =>
      subscribeTyping.current(id, (userId) => {
        if (peers.current.get(id) !== userId) return
        setTyping((current) => ({ ...current, [id]: true }))
        const previous = timers.get(id)
        if (previous) window.clearTimeout(previous)
        timers.set(
          id,
          window.setTimeout(() => setTyping((current) => ({ ...current, [id]: false })), 3000),
        )
      }),
    )
    return () => {
      stops.forEach((stop) => stop())
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [ids])

  async function onSearch(value: string) {
    setQuery(value)
    if (!value.trim()) {
      setResults(null)
      setSearchError('')
      return
    }
    try {
      setResults(await chat.search(value))
      setSearchError('')
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'Search failed.')
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

  const visible = chat.conversations.filter((item) => filter === 'all' || item.unread > 0)

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
        <button type="button" className={iconButton} aria-label="New chat" onClick={() => searchRef.current?.focus()}>
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
      {menuOpen ? (
        <div className="absolute right-3 top-12 z-30 w-48 rounded-xl border border-line bg-panel p-1 shadow-md" role="menu">
          <Link to="/settings" className="hover-wash flex items-center gap-2 rounded-lg px-3 py-2 text-sm" onClick={() => setMenuOpen(false)}>
            <GearIcon className="h-4 w-4" />
            Settings
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
        {showRequests ? (
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
          <div>
            {searchError ? <p className="px-4 py-3 text-sm text-danger">{searchError}</p> : null}
            {results.length === 0 && !searchError ? <p className="px-4 py-8 text-center text-sm text-mist">No one with that username.</p> : null}
            {results.map((person) => (
              <article key={person.id} className="mx-3 my-2 rounded-xl border border-line bg-panel p-3 shadow-sm">
                <div className="flex items-center gap-3">
                  <Avatar name={person.username} url={person.avatarUrl} size="sm" creator={person.isCreator} />
                  <span className="min-w-0">
                    <DisplayName name={person.username} creator={person.isCreator} className="text-sm font-semibold" />
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
                  />
                </div>
              </article>
            ))}
          </div>
        ) : chat.loading ? (
          <ListSkeleton />
        ) : visible.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm leading-6 text-mist">
            {filter === 'unread' ? 'No unread chats.' : 'No chats yet. Search a username to send a contact request.'}
          </p>
        ) : (
          <ul>
            {visible.map((conversation) => {
              const active = chat.activeId === conversation.id
              const mine = conversation.lastMessage?.senderId === profile?.id
              const tick = conversation.lastMessage && mine ? receiptTick(conversation.lastMessage, conversation.peer.showReadReceipts !== false) : null
              const preview = typing[conversation.id] ? 'typing…' : conversation.lastMessage?.body ?? 'No messages yet'
              return (
                <li key={conversation.id}>
                  <Link
                    to={`/c/${conversation.id}`}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 border-b border-line/70 px-3 py-2.5 transition',
                      active ? 'is-active bg-[color-mix(in_oklab,var(--accent)_14%,transparent)]' : 'hover-wash',
                    )}
                  >
                    <Avatar name={conversation.peer.username} url={conversation.peer.avatarUrl} online={isOnline(conversation.peer.lastSeenAt)} creator={conversation.peer.isCreator} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <DisplayName
                          name={conversation.peer.username}
                          creator={conversation.peer.isCreator}
                          className={cn('text-sm', conversation.unread > 0 ? 'font-semibold' : 'font-medium')}
                        />
                        {conversation.lastMessage ? (
                          <time className={cn('shrink-0 text-[11px]', conversation.unread > 0 ? 'text-sakura' : 'text-mist')} dateTime={conversation.lastMessage.createdAt}>
                            {formatListTime(conversation.lastMessage.createdAt)}
                          </time>
                        ) : null}
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span className={cn('flex min-w-0 items-center gap-1 text-sm', typing[conversation.id] ? 'text-foam' : 'text-mist')}>
                          {tick ? (
                            <CheckIcon className={cn('h-3.5 w-3.5 shrink-0', tick === 'seen' ? 'text-sakura' : '')} double={tick !== 'sent'} />
                          ) : null}
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
            })}
          </ul>
        )}
        {chat.error ? <p className="px-4 py-2 text-sm text-danger">{chat.error}</p> : null}
      </div>
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
}: {
  person: SearchPerson
  meId: string
  onAdd: () => Promise<void>
  onMessage: () => Promise<void>
  onAccept: () => Promise<void>
  onDecline: () => Promise<void>
  onCancel: () => Promise<void>
}) {
  const incoming = person.requestStatus === 'pending' && person.requestFromId !== meId
  const outgoing = person.requestStatus === 'pending' && person.requestFromId === meId
  if (person.requestStatus === 'accepted') {
    return (
      <button type="button" className={`${primaryButton} h-9 px-3 text-xs`} onClick={() => void onMessage()}>
        Message
      </button>
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
      </>
    )
  }
  if (outgoing) {
    return (
      <button type="button" className="h-9 rounded-lg border border-line px-3 text-xs font-medium text-mist" onClick={() => void onCancel()}>
        Requested · Cancel
      </button>
    )
  }
  return (
    <button type="button" className={`${primaryButton} h-9 px-3 text-xs`} onClick={() => void onAdd()}>
      Add contact
    </button>
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
                <Avatar name={request.peer.username} url={request.peer.avatarUrl} size="sm" creator={request.peer.isCreator} />
                <DisplayName name={request.peer.username} creator={request.peer.isCreator} className="text-sm font-semibold" />
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
              <Avatar name={request.peer.username} url={request.peer.avatarUrl} size="sm" creator={request.peer.isCreator} />
              <span className="min-w-0 flex-1">
                <DisplayName name={request.peer.username} creator={request.peer.isCreator} className="text-sm font-semibold" />
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
