import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCall } from '../context/CallContext'
import { useChat } from '../context/ChatContext'
import { useSession } from '../context/SessionContext'
import { cn } from '../lib/cn'
import { formatListTime } from '../lib/format'
import { fieldClass } from '../lib/styles'
import type { Profile } from '../types'
import { isOnline } from '../lib/presence'
import { Avatar } from './Avatar'
import { PhoneIcon, SearchIcon } from './Icons'

export function Sidebar() {
  const { mode } = useSession()
  const chat = useChat()
  const call = useCall()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Profile[] | null>(null)
  const [searchError, setSearchError] = useState('')

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

  async function openPerson(userId: string) {
    const id = await chat.startChat(userId)
    await chat.refresh()
    setQuery('')
    setResults(null)
    navigate(`/c/${id}`)
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      <header className="flex h-14 items-center px-4">
        <h1 className="text-base font-semibold tracking-tight">Chats</h1>
      </header>

      <div className="px-3 pb-2">
        <label className="relative block">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist" />
          <input
            className={`${fieldClass} bg-ink/40 pl-9`}
            value={query}
            onChange={(event) => void onSearch(event.target.value)}
            placeholder="Search username"
            aria-label="Search username"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {results ? (
          <div className="space-y-0.5">
            {searchError ? <p className="px-3 py-3 text-sm text-danger">{searchError}</p> : null}
            {results.length === 0 && !searchError ? (
              <p className="px-3 py-8 text-center text-sm text-mist">No one with that username.</p>
            ) : null}
            {results.map((person) => (
              <button
                key={person.id}
                type="button"
                onClick={() => void openPerson(person.id)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-white/5"
              >
                <Avatar name={person.username} url={person.avatarUrl} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">@{person.username}</span>
                  {person.favouriteAnime ? <span className="block truncate text-xs text-mist">{person.favouriteAnime}</span> : null}
                </span>
              </button>
            ))}
          </div>
        ) : chat.loading ? (
          <ListSkeleton />
        ) : chat.conversations.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm leading-6 text-mist">No chats yet. Search a username to start one.</p>
        ) : (
          <ul>
            {chat.conversations.map((conversation) => {
              const active = chat.activeId === conversation.id
              const preview = conversation.lastMessage?.body ?? 'No messages yet'
              return (
                <li key={conversation.id}>
                  <Link
                    to={`/c/${conversation.id}`}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-2 py-2.5 transition',
                      active ? 'bg-white/10' : 'hover:bg-white/5',
                    )}
                  >
                    <Avatar
                      name={conversation.peer.username}
                      url={conversation.peer.avatarUrl}
                      online={isOnline(conversation.peer.lastSeenAt)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium">@{conversation.peer.username}</span>
                        {conversation.lastMessage ? (
                          <time className="shrink-0 text-[11px] text-mist" dateTime={conversation.lastMessage.createdAt}>
                            {formatListTime(conversation.lastMessage.createdAt)}
                          </time>
                        ) : null}
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="truncate text-sm text-mist">{preview}</span>
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
        {chat.error ? <p className="px-3 py-2 text-sm text-danger">{chat.error}</p> : null}
      </div>

      {mode === 'demo' ? (
        <footer className="border-t border-line px-3 py-2">
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-mist transition hover:bg-white/5 hover:text-paper"
            onClick={() => {
              const target = chat.conversations.find((item) => item.peer.username === 'sakura') ?? chat.conversations[0]
              if (target) call.simulateIncoming(target.peer, target.id)
            }}
          >
            <PhoneIcon className="h-4 w-4" />
            Preview call
          </button>
        </footer>
      ) : null}
    </div>
  )
}

function ListSkeleton() {
  return (
    <div className="space-y-1 px-1" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 px-2 py-2.5">
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
