import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCall } from '../context/CallContext'
import { useChat } from '../context/ChatContext'
import { useSession } from '../context/SessionContext'
import { dayKey, formatDayLabel, formatMessageTime } from '../lib/format'
import { fieldClass } from '../lib/styles'
import type { Conversation } from '../types'
import { Avatar } from './Avatar'
import { BackIcon, CheckIcon, PhoneIcon, SendIcon } from './Icons'

export function ChatThread({ conversation }: { conversation: Conversation | undefined }) {
  const { profile } = useSession()
  const chat = useChat()
  const call = useCall()
  const [draft, setDraft] = useState('')
  const [sendError, setSendError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [chat.messages, conversation?.id])

  async function submit() {
    if (!conversation) return
    const body = draft.trim()
    if (!body) return
    setDraft('')
    setSendError('')
    try {
      await chat.send(conversation.id, body)
    } catch (error) {
      setDraft(body)
      setSendError(error instanceof Error ? error.message : 'Could not send.')
    }
  }

  if (!conversation) {
    return (
      <div className="grid h-full place-items-center px-6 text-center text-sm text-mist">
        {chat.loading ? 'Loading chat…' : 'That chat is not in your list.'}
      </div>
    )
  }

  let lastDay = ''

  return (
    <div className="flex h-full min-h-0 flex-col bg-ink/40">
      <header className="flex items-center gap-3 border-b border-line px-3 py-3">
        <Link to="/" className="grid h-11 w-11 place-items-center rounded-full hover:bg-white/5 md:hidden" aria-label="Back to chats">
          <BackIcon className="h-5 w-5" />
        </Link>
        <Avatar name={conversation.peer.username} url={conversation.peer.avatarUrl} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">@{conversation.peer.username}</p>
          <p className="truncate text-xs text-mist">{conversation.peer.favouriteAnime ?? 'Anime fan'}</p>
        </div>
        <button
          type="button"
          className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-sakura to-violet text-white"
          aria-label="Start voice call"
          onClick={() => void call.startCall(conversation.peer, conversation.id)}
        >
          <PhoneIcon className="h-5 w-5" />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {chat.messagesLoading ? <p className="text-center text-sm text-mist">Loading messages…</p> : null}
        {chat.messages.map((message) => {
          const day = dayKey(message.createdAt)
          const showDay = day !== lastDay
          lastDay = day
          const mine = message.senderId === profile?.id
          return (
            <div key={message.id}>
              {showDay ? (
                <p className="my-3 text-center text-[11px] uppercase tracking-[0.16em] text-mist">
                  {formatDayLabel(message.createdAt)}
                </p>
              ) : null}
              <div className={mine ? 'ml-auto max-w-[80%]' : 'mr-auto max-w-[80%]'}>
                <div
                  className={
                    mine
                      ? 'bubble-own relative overflow-hidden rounded-3xl rounded-br-md bg-gradient-to-br from-sakura to-violet px-4 py-2.5 text-white'
                      : 'bubble-other rounded-3xl rounded-bl-md bg-elevated px-4 py-2.5'
                  }
                >
                  <p className="whitespace-pre-wrap text-sm leading-6">{message.body}</p>
                  <p className={mine ? 'mt-1 flex items-center justify-end gap-1 text-[11px] text-white/75' : 'mt-1 text-right text-[11px] text-mist'}>
                    {formatMessageTime(message.createdAt)}
                    {mine ? <CheckIcon className="h-3.5 w-3.5" double={Boolean(message.readAt)} /> : null}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <form
        className="flex items-end gap-2 border-t border-line px-3 py-3"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <label className="min-w-0 flex-1">
          <span className="sr-only">Message</span>
          <textarea
            className={`${fieldClass} max-h-32 resize-none`}
            rows={1}
            maxLength={2000}
            value={draft}
            placeholder={`Message @${conversation.peer.username}`}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void submit()
              }
            }}
          />
        </label>
        <button type="submit" className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white text-ink" aria-label="Send message">
          <SendIcon className="h-5 w-5" />
        </button>
      </form>
      {sendError ? <p className="px-4 pb-3 text-sm text-sakura">{sendError}</p> : null}
    </div>
  )
}

export function Welcome() {
  return (
    <div className="grid h-full place-items-center px-8 text-center">
      <div>
        <p className="text-3xl font-semibold tracking-tight">Your circle is quiet.</p>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-mist">
          Pick a chat, or search a username to start one. Voice calls sit in the corner of a conversation.
        </p>
      </div>
    </div>
  )
}
