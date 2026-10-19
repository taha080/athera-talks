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
import type { Conversation, Message, ReplyTarget } from '../types'
import { Avatar } from './Avatar'
import { Composer } from './Composer'
import { VoiceBubble } from './VoiceBubble'
import { BackIcon, CheckIcon, PhoneIcon } from './Icons'

export function ChatThread({ conversation }: { conversation: Conversation | undefined }) {
  const { profile } = useSession()
  const chat = useChat()
  const call = useCall()
  const [reply, setReply] = useState<ReplyTarget | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)
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
    setTyping(false)
  }, [conversation?.id])

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
        {chat.loading ? 'Loading chat…' : 'That chat is not in your list.'}
      </div>
    )
  }

  const wallpaper = profile?.wallpaper ?? 'plain'
  const customImage = wallpaper === 'custom' && profile?.wallpaperUrl ? profile.wallpaperUrl.replace(/"/g, '') : ''
  const online = isOnline(conversation.peer.lastSeenAt)
  const status = typing ? 'typing…' : presenceLabel(conversation.peer.lastSeenAt) || conversation.peer.favouriteAnime || 'Anime fan'
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
      <header className="flex items-center gap-3 border-b border-line bg-panel/85 px-3 py-3 backdrop-blur">
        <Link to="/" className="grid h-11 w-11 place-items-center rounded-full hover:bg-white/5 md:hidden" aria-label="Back to chats">
          <BackIcon className="h-5 w-5" />
        </Link>
        <Avatar name={conversation.peer.username} url={conversation.peer.avatarUrl} size="sm" online={online} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">@{conversation.peer.username}</p>
          <p className={`truncate text-xs ${typing || online ? 'text-foam' : 'text-mist'}`}>{status}</p>
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
        {!chat.messagesLoading && chat.messages.length === 0 ? (
          <p className="mx-auto mt-10 max-w-xs text-center text-sm leading-6 text-mist">No messages yet. Say hello, send a photo, or hold the mic for a voice note.</p>
        ) : null}
        {chat.messages.map((message) => {
          const day = dayKey(message.createdAt)
          const showDay = day !== lastDay
          lastDay = day
          const mine = message.senderId === profile?.id
          return (
            <div key={message.id}>
              {showDay ? (
                <p className="my-3 text-center text-[11px] uppercase tracking-[0.16em] text-mist">
                  <span className="rounded-full bg-panel/80 px-3 py-1">{formatDayLabel(message.createdAt)}</span>
                </p>
              ) : null}
              <MessageRow
                message={message}
                mine={mine}
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
      {actionError ? <p className="px-4 text-sm text-sakura">{actionError}</p> : null}
      <div className="bg-panel/90 backdrop-blur">
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
  receiptsShared,
  menuOpen,
  onOpenMenu,
  onReply,
  onHide,
  onDelete,
}: {
  message: Message
  mine: boolean
  receiptsShared: boolean
  menuOpen: boolean
  onOpenMenu: () => void
  onReply: () => void
  onHide: () => void
  onDelete: () => void
}) {
  const deleted = Boolean(message.deletedAt)
  const tick = receiptTick(message, receiptsShared)
  return (
    <div className={mine ? 'ml-auto max-w-[80%]' : 'mr-auto max-w-[80%]'}>
      <div className="relative">
        <button
          type="button"
          className={
            mine
              ? 'bubble-own bubble-in relative w-full overflow-hidden rounded-3xl rounded-br-md bg-gradient-to-br from-sakura to-violet px-4 py-2.5 text-left text-white'
              : 'bubble-other bubble-in w-full rounded-3xl rounded-bl-md bg-elevated px-4 py-2.5 text-left'
          }
          onClick={onOpenMenu}
          aria-expanded={menuOpen}
          aria-label="Message actions"
        >
          {message.replyPreview && !deleted ? (
            <p className={mine ? 'mb-1 truncate border-l-2 border-white/70 pl-2 text-xs text-white/80' : 'mb-1 truncate border-l-2 border-sakura pl-2 text-xs text-mist'}>
              {message.replyPreview}
            </p>
          ) : null}
          {deleted ? <p className="text-sm italic opacity-80">Message deleted</p> : null}
          {!deleted && message.kind === 'image' ? (
            message.mediaUrl ? (
              <img src={message.mediaUrl} alt="Photo" className="max-h-64 rounded-2xl object-cover" />
            ) : (
              <p className="text-sm">Photo</p>
            )
          ) : null}
          {!deleted && message.kind === 'voice' ? (
            <VoiceBubble src={message.mediaUrl} seconds={message.mediaSeconds} waveform={message.waveform} mine={mine} />
          ) : null}
          {!deleted && message.kind !== 'voice' && message.kind !== 'image' ? (
            <p className="whitespace-pre-wrap text-sm leading-6">{message.body}</p>
          ) : null}
          <p className={mine ? 'mt-1 flex items-center justify-end gap-1 text-[11px] text-white/75' : 'mt-1 text-right text-[11px] text-mist'}>
            {formatMessageTime(message.createdAt)}
            {mine && !deleted ? (
              <span title={tick} aria-label={tick}>
                <CheckIcon className={tick === 'seen' ? 'h-3.5 w-3.5 text-foam' : 'h-3.5 w-3.5'} double={tick !== 'sent'} />
              </span>
            ) : null}
          </p>
        </button>
        {menuOpen && !deleted ? (
          <div className={mine ? 'absolute right-0 z-10 mt-1 w-44 rounded-2xl border border-line bg-panel p-1 shadow-xl' : 'absolute left-0 z-10 mt-1 w-44 rounded-2xl border border-line bg-panel p-1 shadow-xl'}>
            <button type="button" className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-white/5" onClick={onReply}>
              Reply
            </button>
            <button type="button" className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-white/5" onClick={onHide}>
              Delete for me
            </button>
            {mine ? (
              <button type="button" className="block w-full rounded-xl px-3 py-2 text-left text-sm text-sakura hover:bg-white/5" onClick={onDelete}>
                Delete for everyone
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function Welcome() {
  return (
    <div className="grid h-full place-items-center px-8 text-center">
      <div>
        <p className="text-3xl font-semibold tracking-tight">Your circle is quiet.</p>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-mist">
          Pick a chat, or search a username to start one. Voice notes, photos, and calls live inside the conversation.
        </p>
      </div>
    </div>
  )
}
