import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCall } from '../context/CallContext'
import { useChat } from '../context/ChatContext'
import { useSession } from '../context/SessionContext'
import { wallpaperClass } from '../lib/appearance'
import { dayKey, formatDayLabel, formatMessageTime } from '../lib/format'
import { messagePreview } from '../lib/messages'
import { isOnline, presenceLabel } from '../lib/presence'
import { receiptTick } from '../lib/receipts'
import { iconButton } from '../lib/styles'
import type { Conversation, Message, ReplyTarget } from '../types'
import { Avatar } from './Avatar'
import { Composer } from './Composer'
import { VoiceBubble } from './VoiceBubble'
import { BackIcon, CheckIcon, CloseIcon, MoreHorizontalIcon, MoreIcon, PhoneIcon } from './Icons'

type GroupPos = 'single' | 'start' | 'mid' | 'end'

function groupPos(messages: Message[], index: number): GroupPos {
  const current = messages[index]
  const prev = messages[index - 1]
  const next = messages[index + 1]
  const close = (a: Message | undefined, b: Message | undefined) => {
    if (!a || !b || a.senderId !== b.senderId || a.deletedAt || b.deletedAt) return false
    if (dayKey(a.createdAt) !== dayKey(b.createdAt)) return false
    return Math.abs(new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) < 5 * 60 * 1000
  }
  const withPrev = close(prev, current)
  const withNext = close(current, next)
  if (withPrev && withNext) return 'mid'
  if (withPrev) return 'end'
  if (withNext) return 'start'
  return 'single'
}

export function ChatThread({ conversation }: { conversation: Conversation | undefined }) {
  const { profile } = useSession()
  const chat = useChat()
  const call = useCall()
  const [reply, setReply] = useState<ReplyTarget | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)
  const [typing, setTyping] = useState(false)
  const [actionError, setActionError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const typingTimer = useRef<number | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [chat.messages, conversation?.id])

  useEffect(() => {
    setReply(null)
    setMenuId(null)
    setInfoOpen(false)
    setTyping(false)
  }, [conversation?.id])

  useEffect(() => {
    if (!infoOpen) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setInfoOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [infoOpen])

  useEffect(() => {
    if (!conversation) return
    return chat.subscribeTyping(conversation.id, (userId) => {
      if (userId !== conversation.peer.id) return
      setTyping(true)
      if (typingTimer.current) window.clearTimeout(typingTimer.current)
      typingTimer.current = window.setTimeout(() => setTyping(false), 3000)
    })
  }, [chat, conversation])

  if (!conversation) {
    return (
      <div className="grid h-full place-items-center px-6 text-center text-sm text-mist">
        {chat.loading ? <MessageSkeleton /> : 'That chat is not in your list.'}
      </div>
    )
  }

  const wallpaper = profile?.wallpaper ?? 'plain'
  const customImage = wallpaper === 'custom' && profile?.wallpaperUrl ? profile.wallpaperUrl.replace(/"/g, '') : ''
  const online = isOnline(conversation.peer.lastSeenAt)
  const status = typing ? 'typing…' : presenceLabel(conversation.peer.lastSeenAt) || 'offline'
  let lastDay = ''

  async function act(task: Promise<void>) {
    setActionError('')
    try {
      await task
      setMenuId(null)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not update that message.')
    }
  }

  return (
    <div
      className={`flex h-full min-h-0 flex-col ${wallpaperClass(wallpaper)}`}
      style={customImage ? { backgroundImage: `url("${customImage}")` } : undefined}
    >
      <header className="relative flex h-14 items-center gap-2 border-b border-line bg-panel/95 px-2 backdrop-blur">
        <Link to="/" className={`${iconButton} md:hidden`} aria-label="Back to chats">
          <BackIcon className="h-5 w-5" />
        </Link>
        <Avatar name={conversation.peer.username} url={conversation.peer.avatarUrl} size="sm" online={online} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">@{conversation.peer.username}</p>
          <p className={`truncate text-xs ${typing || online ? 'text-foam' : 'text-mist'}`}>{status}</p>
        </div>
        <button
          type="button"
          className={iconButton}
          aria-label="Start voice call"
          onClick={() => void call.startCall(conversation.peer, conversation.id)}
        >
          <PhoneIcon className="h-5 w-5" />
        </button>
        <button
          type="button"
          className={iconButton}
          aria-label="Conversation details"
          aria-expanded={infoOpen}
          aria-haspopup="dialog"
          onClick={() => setInfoOpen((open) => !open)}
        >
          <MoreIcon className="h-5 w-5" />
        </button>
        {infoOpen ? (
          <div className="absolute right-2 top-14 z-20 w-64 rounded-lg border border-line bg-panel p-3 text-left shadow-md" role="dialog" aria-label="Conversation details">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">@{conversation.peer.username}</p>
                <p className="mt-1 text-xs text-mist">{status}</p>
                {conversation.peer.favouriteAnime ? (
                  <p className="mt-2 text-xs text-mist">{conversation.peer.favouriteAnime}</p>
                ) : null}
              </div>
              <button type="button" className={iconButton} aria-label="Close details" onClick={() => setInfoOpen(false)}>
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6">
        {chat.messagesLoading ? <MessageSkeleton /> : null}
        {!chat.messagesLoading && chat.messages.length === 0 ? (
          <p className="mx-auto mt-16 max-w-xs text-center text-sm leading-6 text-mist">
            No messages yet. Say hello, send a photo, or hold the mic for a voice note.
          </p>
        ) : null}
        {chat.messages.map((message, index) => {
          const day = dayKey(message.createdAt)
          const showDay = day !== lastDay
          lastDay = day
          const mine = message.senderId === profile?.id
          const pos = groupPos(chat.messages, index)
          return (
            <div key={message.id} className={pos === 'start' || pos === 'single' ? 'mt-3 first:mt-0' : 'mt-0.5'}>
              {showDay ? (
                <p className="my-3 text-center">
                  <span className="rounded-full bg-panel/90 px-3 py-1 text-[11px] font-medium text-mist shadow-sm">
                    {formatDayLabel(message.createdAt)}
                  </span>
                </p>
              ) : null}
              <MessageRow
                message={message}
                mine={mine}
                pos={pos}
                receiptsShared={conversation.peer.showReadReceipts !== false}
                menuOpen={menuId === message.id}
                onOpenMenu={() => setMenuId((current) => (current === message.id ? null : message.id))}
                onReply={() => {
                  setReply({ id: message.id, preview: messagePreview(message).slice(0, 80) })
                  setMenuId(null)
                }}
                onHide={() => void act(chat.hideMessage(message.id))}
                onDelete={() => void act(chat.deleteForEveryone(message))}
              />
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
      {actionError ? <p className="px-4 text-sm text-danger">{actionError}</p> : null}
      <div className="bg-panel/95 backdrop-blur">
        <Composer
          peerName={conversation.peer.username}
          reply={reply}
          onClearReply={() => setReply(null)}
          onTyping={() => chat.broadcastTyping(conversation.id)}
          onSendText={async (body) => {
            await chat.send(conversation.id, body, reply)
            setReply(null)
          }}
          onSendFile={async (file, mime, kind, seconds, waveform) => {
            await chat.sendMedia({
              conversationId: conversation.id,
              kind,
              file,
              mime,
              seconds,
              waveform,
              reply,
            })
            setReply(null)
          }}
        />
      </div>
    </div>
  )
}

function MessageRow({
  message,
  mine,
  pos,
  receiptsShared,
  menuOpen,
  onOpenMenu,
  onReply,
  onHide,
  onDelete,
}: {
  message: Message
  mine: boolean
  pos: GroupPos
  receiptsShared: boolean
  menuOpen: boolean
  onOpenMenu: () => void
  onReply: () => void
  onHide: () => void
  onDelete: () => void
}) {
  const deleted = Boolean(message.deletedAt)
  const tick = receiptTick(message, receiptsShared)
  const tailed = !deleted && (pos === 'single' || pos === 'end')
  const radius = mine
    ? tailed
      ? 'rounded-[18px] rounded-br-[4px]'
      : 'rounded-[18px] rounded-br-[8px]'
    : tailed
      ? 'rounded-[18px] rounded-bl-[4px]'
      : 'rounded-[18px] rounded-bl-[8px]'
  const image = !deleted && message.kind === 'image'
  return (
    <div className={mine ? 'ml-auto flex max-w-[78%] items-end justify-end gap-1' : 'mr-auto flex max-w-[78%] items-end gap-1'}>
      {!mine ? <span className="w-6 shrink-0" /> : null}
      <div className="relative min-w-0">
        <div
          className={`${mine ? 'bubble-own' : 'bubble-other'} bubble-in relative w-full text-left ${radius} ${image ? 'overflow-hidden p-1' : 'px-3 py-2'} ${tailed ? (mine ? 'tail-own' : 'tail-other') : ''}`}
        >
          {message.replyPreview && !deleted ? (
            <p className={mine ? 'mb-1 truncate border-l-2 border-white/70 pl-2 text-xs text-white/80' : 'mb-1 truncate border-l-2 border-sakura pl-2 text-xs text-mist'}>
              {message.replyPreview}
            </p>
          ) : null}
          {deleted ? <p className="text-sm italic opacity-80">Message deleted</p> : null}
          {image ? (
            message.mediaUrl ? (
              <img src={message.mediaUrl} alt="Photo" className="max-h-72 rounded-xl object-cover" />
            ) : (
              <p className="px-2 py-1 text-sm">Photo</p>
            )
          ) : null}
          {!deleted && message.kind === 'voice' ? (
            <VoiceBubble src={message.mediaUrl} seconds={message.mediaSeconds} waveform={message.waveform} mine={mine} />
          ) : null}
          {!deleted && message.kind !== 'voice' && message.kind !== 'image' ? (
            <p className="whitespace-pre-wrap text-sm leading-5">{message.body}</p>
          ) : null}
          <p className={mine ? 'mt-1 flex items-center justify-end gap-1 px-1 text-[11px] text-white/80' : 'mt-1 text-right text-[11px] text-mist'}>
            <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
            {mine && !deleted ? (
              <span title={tick} aria-label={tick}>
                <CheckIcon className={tick === 'seen' ? 'h-3.5 w-3.5 text-white' : 'h-3.5 w-3.5'} double={tick !== 'sent'} />
              </span>
            ) : null}
          </p>
        </div>
        {menuOpen && !deleted ? (
          <div className={mine ? 'absolute right-0 z-10 mt-1 w-44 rounded-lg border border-line bg-panel p-1 shadow-md' : 'absolute left-0 z-10 mt-1 w-44 rounded-lg border border-line bg-panel p-1 shadow-md'} role="menu">
            <button type="button" role="menuitem" className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-white/5" onClick={onReply}>
              Reply
            </button>
            <button type="button" role="menuitem" className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-white/5" onClick={onHide}>
              Delete for me
            </button>
            {mine ? (
              <button type="button" role="menuitem" className="block w-full rounded-md px-3 py-2 text-left text-sm text-danger hover:bg-white/5" onClick={onDelete}>
                Delete for everyone
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {!deleted ? (
        <button type="button" className={`${iconButton} h-8 w-8`} aria-expanded={menuOpen} aria-label="Message actions" onClick={onOpenMenu}>
          <MoreHorizontalIcon className="h-4 w-4" />
        </button>
      ) : mine ? (
        <span className="w-8" />
      ) : null}
    </div>
  )
}

function MessageSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <span className="skeleton ml-0 block h-10 w-40 rounded-2xl" />
      <span className="skeleton ml-auto block h-14 w-52 rounded-2xl" />
      <span className="skeleton block h-10 w-48 rounded-2xl" />
    </div>
  )
}

export function Welcome() {
  return (
    <div className="grid h-full place-items-center bg-ink px-8 text-center">
      <div>
        <p className="text-xl font-semibold tracking-tight">Select a chat</p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-mist">
          Search for someone to start a conversation. Messages, photos, voice notes, and calls stay in the thread.
        </p>
      </div>
    </div>
  )
}
