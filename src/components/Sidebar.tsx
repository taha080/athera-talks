import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCall } from '../context/CallContext'
import { useChat } from '../context/ChatContext'
import { useSession } from '../context/SessionContext'
import { cn } from '../lib/cn'
import { formatListTime } from '../lib/format'
import { fieldClass } from '../lib/styles'
import type { Profile } from '../types'
import { useTheme } from '../context/ThemeContext'
import { Avatar } from './Avatar'
import { Credit } from './Credit'
import { PhoneIcon, SearchIcon } from './Icons'
import { LeafMark } from './LeafMark'
import { ThemeSwitcher } from './ThemeSwitcher'

export function Sidebar() {
  const { profile, signOut, mode } = useSession()
  const { theme } = useTheme()
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

  async function openFan(userId: string) {
    const id = await chat.startChat(userId)
    await chat.refresh()
    setQuery('')
    setResults(null)
    navigate(`/c/${id}`)
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel/80">
      <header className="flex items-center justify-between gap-3 px-4 py-4">
        <div className="flex items-center gap-2">
          {theme === 'naruto' ? <LeafMark className="h-9 w-9 text-sakura" /> : null}
          <div>
            <p className="text-lg font-semibold tracking-tight">T.A.Talk</p>
            <p className="text-xs text-mist">@{profile?.username}</p>
          </div>
        </div>
        <Link to="/profile" aria-label="Open profile" className="rounded-full ring-sakura/40 focus-visible:ring-2">
          <Avatar name={profile?.username ?? 'you'} url={profile?.avatarUrl} size="sm" />
        </Link>
      </header>

      <div className="px-4">
        <label className="relative block">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist" />
          <input
            className={`${fieldClass} pl-10`}
            value={query}
            onChange={(event) => void onSearch(event.target.value)}
            placeholder="Search username"
            aria-label="Search username"
          />
        </label>
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-2">
        {results ? (
          <div className="space-y-1 px-1">
            {searchError ? <p className="px-2 py-3 text-sm text-sakura">{searchError}</p> : null}
            {results.length === 0 && !searchError ? (
              <p className="px-2 py-6 text-center text-sm text-mist">No fans with that username.</p>
            ) : null}
            {results.map((fan) => (
              <button
                key={fan.id}
                type="button"
                onClick={() => void openFan(fan.id)}
                className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-white/5"
              >
                <Avatar name={fan.username} url={fan.avatarUrl} size="sm" />
                <span>
                  <span className="block text-sm font-medium">@{fan.username}</span>
                  <span className="block text-xs text-mist">{fan.favouriteAnime ?? 'No favourite yet'}</span>
                </span>
              </button>
            ))}
          </div>
        ) : chat.loading ? (
          <p className="px-3 py-6 text-sm text-mist">Loading chats…</p>
        ) : chat.conversations.length === 0 ? (
          <p className="px-3 py-6 text-sm leading-6 text-mist">
            No chats yet. Search a username to start one.
          </p>
        ) : (
          <ul>
            {chat.conversations.map((conversation) => {
              const active = chat.activeId === conversation.id
              const preview = conversation.lastMessage?.body ?? 'Say hello'
              return (
                <li key={conversation.id}>
                  <Link
                    to={`/c/${conversation.id}`}
                    className={cn(
                      'flex items-center gap-3 rounded-2xl px-2 py-3',
                      active ? 'bg-white/10' : 'hover:bg-white/5',
                    )}
                  >
                    <Avatar name={conversation.peer.username} url={conversation.peer.avatarUrl} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-medium">@{conversation.peer.username}</span>
                        {conversation.lastMessage ? (
                          <span className="shrink-0 text-[11px] text-mist">
                            {formatListTime(conversation.lastMessage.createdAt)}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="truncate text-sm text-mist">{preview}</span>
                        {conversation.unread > 0 ? (
                          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-sakura px-1 text-[11px] font-semibold text-white">
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
        {chat.error ? <p className="px-3 py-2 text-sm text-sakura">{chat.error}</p> : null}
      </div>

      <footer className="space-y-3 border-t border-line px-4 py-4">
        {mode === 'demo' ? (
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-full border border-line px-3 py-2 text-xs font-medium text-mist hover:text-paper"
            onClick={() => {
              const target = chat.conversations.find((item) => item.peer.username === 'sakura') ?? chat.conversations[0]
              if (target) call.simulateIncoming(target.peer, target.id)
            }}
          >
            <PhoneIcon className="h-4 w-4" />
            Preview incoming call
          </button>
        ) : null}
        <ThemeSwitcher className="justify-between" />
        <button type="button" onClick={() => void signOut().then(() => navigate('/login'))} className="w-full rounded-full bg-white/5 px-3 py-2 text-sm font-medium text-paper hover:bg-white/10">
          Sign out
        </button>
        <Credit />
      </footer>
    </div>
  )
}
