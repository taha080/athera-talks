import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCall } from '../context/CallContext'
import { useChat } from '../context/ChatContext'
import { useSession } from '../context/SessionContext'
import { useTheme } from '../context/ThemeContext'
import { callLogLabel } from '../lib/callLog'
import { wallpaperClass } from '../lib/appearance'
import { conversationUsesForgerBubbles, conversationWallpaperClass, conversationWallpaperMedia } from '../lib/conversationWallpaper'
import { chatTitle, isGroup, showSenderName } from '../lib/chatList'
import { QUICK_REACTIONS, groupPosition, groupedReactions, linkHost, linkParts, type GroupPos } from '../lib/chatView'
import { dayKey, formatDayLabel, formatMessageTime } from '../lib/format'
import { messagePreview } from '../lib/messages'
import { firstChatAttachment } from '../lib/chatVideo'
import { isOnline, presenceLabel } from '../lib/presence'
import { TYPING_TTL_MS } from '../lib/typing'
import { canViewSharedProfile } from '../lib/profileAccess'
import { receiptTick } from '../lib/receipts'
import { iconButton } from '../lib/styles'
import type { CallLog, Conversation, GroupMember, Message, ReplyTarget } from '../types'
import { Avatar } from './Avatar'
import { VideoBubble } from './VideoBubble'
import { hasPremium } from '../lib/premium'
import { DisplayName } from './CreatorBadge'
import { Composer } from './Composer'
import { GroupPanel } from './GroupPanel'
import { ProfileSheet, type SharedProfile } from './ProfileSheet'
import { ReportDialog } from './ReportDialog'
import { VoiceBubble } from './VoiceBubble'
import { BackIcon, CheckIcon, CloseIcon, CopyIcon, DownIcon, MoreIcon, PhoneIcon, ReplyIcon, SearchIcon, SmileIcon, TrashIcon } from './Icons'

export function ChatThread({ conversation }: { conversation: Conversation | undefined }) {
  const navigate = useNavigate()
  const { profile, chat: api } = useSession()
  const [calls, setCalls] = useState<CallLog[]>([])
  const { theme } = useTheme()
  const chat = useChat()
  const call = useCall()
  const [reply, setReply] = useState<ReplyTarget | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [menuPoint, setMenuPoint] = useState<{ x: number; y: number } | null>(null)
  const [reactId, setReactId] = useState<string | null>(null)
  const [actionsId, setActionsId] = useState<string | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null)
  const [reporting, setReporting] = useState<{ id: string; username: string } | null>(null)
  const [profilePerson, setProfilePerson] = useState<SharedProfile | null>(null)
  const [members, setMembers] = useState<GroupMember[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [matchIndex, setMatchIndex] = useState(0)
  const [typing, setTyping] = useState(false)
  const [actionError, setActionError] = useState('')
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [showJump, setShowJump] = useState(false)
  const [dropFile, setDropFile] = useState<File | null>(null)
  const [dropHot, setDropHot] = useState(false)
  const dragDepth = useRef(0)
  const wallpaperVideo = useRef<HTMLVideoElement>(null)
  const [jumpCount, setJumpCount] = useState(0)
  const [dividerId, setDividerId] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const nearBottom = useRef(true)
  const seenCount = useRef(0)
  const marked = useRef<string | null>(null)
  const openedUnread = useRef<{ id?: string; count: number }>({ count: 0 })
  const typingTimer = useRef<number | null>(null)
  if (openedUnread.current.id !== conversation?.id) {
    openedUnread.current = { id: conversation?.id, count: conversation?.unread ?? 0 }
  }

  const query = search.trim().toLowerCase()
  const matches = useMemo(
    () => (query ? chat.messages.filter((message) => !message.deletedAt && message.body.toLowerCase().includes(query)) : []),
    [chat.messages, query],
  )

  useEffect(() => {
    if (!conversation?.id) {
      setCalls([])
      return
    }
    let stop = () => {}
    let cancelled = false
    void api
      .listCalls(conversation.id)
      .then((rows) => {
        if (!cancelled) setCalls(rows)
      })
      .catch(() => {
        if (!cancelled) setCalls([])
      })
    stop = api.subscribeCalls(conversation.id, (row) => {
      setCalls((prev) => (prev.some((item) => item.id === row.id) ? prev : [...prev, row]))
    })
    return () => {
      cancelled = true
      stop()
    }
  }, [api, conversation?.id])

  useEffect(() => {
    const video = wallpaperVideo.current
    if (!video) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    video.muted = true
    if (reduce) {
      video.pause()
      return
    }
    void video.play().catch(() => {})
  }, [conversation?.id])

  useEffect(() => {
    setReply(null)
    setMenuId(null)
    setMenuPoint(null)
    setReactId(null)
    setActionsId(null)
    setInfoOpen(false)
    setReporting(null)
    setProfilePerson(null)
    setSearchOpen(false)
    setSearch('')
    setTyping(false)
    setDropFile(null)
    setDropHot(false)
    setShowJump(false)
    setJumpCount(0)
    setDividerId(null)
    nearBottom.current = true
    seenCount.current = 0
    marked.current = null
  }, [conversation?.id])

  useEffect(() => {
    if (!conversation || chat.messagesLoading || marked.current === conversation.id) return
    if (chat.messages.length === 0 || chat.messages.some((message) => message.conversationId !== conversation.id)) return
    marked.current = conversation.id
    const incoming = chat.messages.filter((message) => message.senderId !== profile?.id && !message.deletedAt)
    const firstUnread = openedUnread.current.count > 0 ? incoming[Math.max(0, incoming.length - openedUnread.current.count)] : undefined
    setDividerId(firstUnread?.id ?? null)
  }, [chat.messages, chat.messagesLoading, conversation, profile?.id])

  useEffect(() => {
    if (chat.messagesLoading) return
    const added = chat.messages.length - seenCount.current
    const last = chat.messages.at(-1)
    seenCount.current = chat.messages.length
    if (nearBottom.current || last?.senderId === profile?.id) {
      bottomRef.current?.scrollIntoView({ block: 'end', behavior: added === 1 ? 'smooth' : 'auto' })
      setJumpCount(0)
      setShowJump(false)
      return
    }
    if (added > 0 && last && last.senderId !== profile?.id) {
      setJumpCount((count) => count + added)
      setShowJump(true)
      setDividerId((current) => current ?? chat.messages[Math.max(0, chat.messages.length - added)]?.id ?? null)
    }
  }, [chat.messages, chat.messagesLoading, profile?.id])

  useEffect(() => {
    if (!actionsId && !menuId) return
    function onPointerDown(event: PointerEvent) {
      const id = actionsId ?? menuId
      const row = id ? document.querySelector(`[data-message-id="${id}"]`) : null
      if (event.target instanceof Node && row?.contains(event.target)) return
      setActionsId(null)
      setMenuId(null)
      setMenuPoint(null)
      setReactId(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [actionsId, menuId])

  useEffect(() => {
    if (!infoOpen && !lightbox) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setInfoOpen(false)
        setLightbox(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [infoOpen, lightbox])

  const peerId = conversation?.peer.id
  const conversationId = conversation?.id
  const groupChat = conversation ? isGroup(conversation) : false
  const subscribeTyping = useRef(chat.subscribeTyping)
  subscribeTyping.current = chat.subscribeTyping
  const listMembers = useRef(chat.listMembers)
  listMembers.current = chat.listMembers

  useEffect(() => {
    if (!conversationId) return
    let cancel = false
    void listMembers.current(conversationId)
      .then((rows) => {
        if (!cancel) setMembers(rows)
      })
      .catch(() => {
        if (!cancel) setMembers([])
      })
    return () => {
      cancel = true
    }
  }, [conversationId, conversation?.memberCount, conversation?.title])

  useEffect(() => {
    if (!conversationId || !peerId) return
    const stop = subscribeTyping.current(conversationId, (userId, active) => {
      if (groupChat) {
        if (userId === profile?.id) return
      } else if (userId !== peerId) return
      if (!active) {
        if (typingTimer.current) window.clearTimeout(typingTimer.current)
        setTyping(false)
        return
      }
      setTyping(true)
      if (typingTimer.current) window.clearTimeout(typingTimer.current)
      typingTimer.current = window.setTimeout(() => setTyping(false), TYPING_TTL_MS)
    })
    return () => {
      stop()
      if (typingTimer.current) window.clearTimeout(typingTimer.current)
    }
  }, [conversationId, groupChat, peerId, profile?.id])

  const peerMessageId = chat.messages.filter((message) => message.conversationId === conversationId && message.senderId === peerId).at(-1)?.id
  useEffect(() => {
    setTyping(false)
  }, [peerMessageId])

  const broadcastTyping = useRef(chat.broadcastTyping)
  broadcastTyping.current = chat.broadcastTyping
  useEffect(() => {
    const id = conversationId
    return () => {
      if (id) broadcastTyping.current(id, false)
    }
  }, [conversationId])

  useEffect(() => {
    const id = matches[matchIndex]?.id
    if (!id) return
    document.querySelector(`[data-message-id="${id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [matchIndex, matches])

  if (!conversation) {
    return (
      <div className="grid h-full place-items-center px-6 text-center text-sm text-mist">
        {chat.loading ? <MessageSkeleton /> : 'That chat is not in your list.'}
      </div>
    )
  }

  const wallpaper = profile?.wallpaper ?? 'plain'
  const specialWallpaper = conversationWallpaperClass(conversation.id)
  const forgerMedia = conversationWallpaperMedia(conversation.id)
  const customImage =
    specialWallpaper || theme === 'midnight' || wallpaper !== 'custom' || !profile?.wallpaperUrl
      ? ''
      : profile.wallpaperUrl.replace(/"/g, '')
  const group = isGroup(conversation)
  const pendingRequest = !group && chat.requests.some((request) => request.peer.id === conversation.peer.id && request.status === 'pending')
  const title = chatTitle(conversation)
  const online = group ? false : isOnline(conversation.peer.lastSeenAt)
  const status = typing ? 'typing…' : group ? `${conversation.memberCount ?? members.length} members` : presenceLabel(conversation.peer.lastSeenAt) || 'offline'
  const contacts = chat.conversations
    .filter((item) => !isGroup(item) && !item.blocked)
    .map((item) => item.peer)
  let lastDay = ''

  function onScroll() {
    const node = scroller.current
    if (!node) return
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight
    const near = distance < 96
    nearBottom.current = near
    setShowJump(!near)
    if (near) setJumpCount(0)
  }

  function jumpToBottom() {
    nearBottom.current = true
    setJumpCount(0)
    setShowJump(false)
    bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }

  async function act(task: Promise<void>) {
    setActionError('')
    try {
      await task
      setMenuId(null)
      setActionsId(null)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not update that message.')
    }
  }

  const directPeerIds = chat.conversations.filter((item) => !isGroup(item)).map((item) => item.peer.id)

  function profileFromPeer(peer: Conversation['peer']): SharedProfile {
    return {
      id: peer.id,
      username: peer.username,
      avatarUrl: peer.avatarUrl,
      favouriteAnime: peer.favouriteAnime,
      isCreator: Boolean(peer.isCreator),
      isPremium: hasPremium(peer),
      lastSeenAt: peer.lastSeenAt ?? null,
    }
  }

  function profileFromMember(member: GroupMember): SharedProfile {
    return {
      id: member.id,
      username: member.username,
      avatarUrl: member.avatarUrl,
      favouriteAnime: member.favouriteAnime,
      isCreator: member.isCreator,
      isPremium: hasPremium(member),
      lastSeenAt: member.lastSeenAt ?? null,
    }
  }

  function openProfile(person: SharedProfile, source: 'direct' | 'group') {
    const allowed = canViewSharedProfile({
      personId: person.id,
      meId: profile?.id,
      directPeerIds: source === 'direct' ? [...directPeerIds, person.id] : directPeerIds,
      groupMemberIds: source === 'group' ? members.map((member) => member.id) : [],
    })
    if (!allowed) return
    setInfoOpen(false)
    setProfilePerson(person)
  }

  async function copyMessage(message: Message) {
    const text = message.kind === 'image' ? 'Photo' : message.kind === 'video' ? 'Video' : message.kind === 'voice' ? 'Voice message' : message.body
    try {
      await navigator.clipboard.writeText(text)
      chat.pushToast('Copied')
    } catch {
      chat.pushToast('Could not copy that message')
    }
    setMenuId(null)
    setActionsId(null)
  }

  return (
    <div
      className={`chat-column relative flex h-full min-h-0 flex-col ${specialWallpaper || wallpaperClass(wallpaper)}`}
      style={customImage ? { backgroundImage: `url("${customImage}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
      onDragEnter={(event) => {
        if (pendingRequest || conversation.blocked || !Array.from(event.dataTransfer.types).includes('Files')) return
        event.preventDefault()
        dragDepth.current += 1
        setDropHot(true)
      }}
      onDragOver={(event) => {
        if (pendingRequest || conversation.blocked || !Array.from(event.dataTransfer.types).includes('Files')) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (dragDepth.current === 0) setDropHot(false)
      }}
      onDrop={(event) => {
        dragDepth.current = 0
        setDropHot(false)
        if (pendingRequest || conversation.blocked) return
        event.preventDefault()
        const file = firstChatAttachment(event.dataTransfer.files)
        if (file) setDropFile(file)
        else if (event.dataTransfer.files.length > 0) setActionError('Choose a photo or video.')
      }}
    >
      {forgerMedia ? (
        <div className="forger-wallpaper" aria-hidden="true">
          <picture className="forger-wallpaper-fallback">
            <source srcSet={forgerMedia.still} media="(prefers-reduced-motion: reduce)" />
            <img src={forgerMedia.gif} alt="" />
          </picture>
          <video
            ref={wallpaperVideo}
            poster={forgerMedia.gif}
            autoPlay
            muted
            loop
            playsInline
            disablePictureInPicture
            preload="auto"
            tabIndex={-1}
          >
            <source src={forgerMedia.webm} type="video/webm" />
            <source src={forgerMedia.mp4} type="video/mp4" />
          </video>
        </div>
      ) : null}
      {dropHot ? (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-black/45">
          <p className="rounded-xl border border-line bg-panel px-4 py-2 text-sm text-paper">Drop a photo or video</p>
        </div>
      ) : null}
      <header className="chat-header relative flex h-14 shrink-0 items-center gap-2 border-b border-line bg-panel px-2">
        <Link to="/" className={`${iconButton} md:hidden`} aria-label="Back to chats">
          <BackIcon className="h-5 w-5" />
        </Link>
        {group ? (
          <>
            <Avatar name={title} url={conversation.photoUrl ?? null} size="sm" creator={false} />
            <div className="min-w-0 flex-1">
              <DisplayName name={title} creator={false} className="chat-title text-sm font-semibold" />
              <p className={`chat-status truncate text-xs ${typing || online ? 'text-foam' : 'text-mist'}`}>{status}</p>
            </div>
          </>
        ) : (
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left"
            aria-label={`View @${conversation.peer.username}`}
            onClick={() => openProfile(profileFromPeer(conversation.peer), 'direct')}
          >
            <Avatar name={title} url={conversation.peer.avatarUrl} size="sm" online={online} creator={conversation.peer.isCreator} premium={hasPremium(conversation.peer)} />
            <span className="min-w-0 flex-1">
              <DisplayName name={title} creator={conversation.peer.isCreator} premium={hasPremium(conversation.peer)} className="chat-title text-sm font-semibold" />
              <p className={`chat-status truncate text-xs ${typing || online ? 'text-foam' : 'text-mist'}`}>{status}</p>
            </span>
          </button>
        )}
        {group || conversation.blocked || pendingRequest ? null : (
          <button type="button" className={iconButton} aria-label="Start voice call" onClick={() => void call.startCall(conversation.peer, conversation.id)}>
            <PhoneIcon className="h-5 w-5" />
          </button>
        )}
        <button
          type="button"
          className={iconButton}
          aria-label="Search in chat"
          aria-pressed={searchOpen}
          onClick={() => {
            setSearchOpen((open) => !open)
            setSearch('')
            setMatchIndex(0)
          }}
        >
          <SearchIcon className="h-5 w-5" />
        </button>
        <button type="button" className={iconButton} aria-label="Conversation details" aria-expanded={infoOpen} aria-haspopup="dialog" onClick={() => setInfoOpen((open) => !open)}>
          <MoreIcon className="h-5 w-5" />
        </button>
        {infoOpen && group ? (
          <GroupPanel
            conversation={conversation}
            meId={profile?.id ?? ''}
            members={members}
            contacts={contacts}
            onClose={() => setInfoOpen(false)}
            onRename={(next) => chat.renameGroup(conversation.id, next)}
            onPhoto={(file) => chat.setGroupPhoto(conversation.id, file)}
            onAdd={(userId) => chat.addMember(conversation.id, userId)}
            onRemove={(userId) => chat.removeMember(conversation.id, userId)}
            onRole={(userId, role) => chat.setMemberRole(conversation.id, userId, role)}
            onLeave={async () => {
              await chat.leaveGroup(conversation.id)
              setInfoOpen(false)
              navigate('/')
            }}
            onDelete={async () => {
              await chat.deleteGroup(conversation.id)
              setInfoOpen(false)
              navigate('/')
            }}
            onOpenProfile={(member) => openProfile(profileFromMember(member), 'group')}
          />
        ) : null}
        {infoOpen && !group ? (
          <div className="absolute right-2 top-14 z-20 w-64 rounded-xl border border-line bg-panel p-3 text-left shadow-md" role="dialog" aria-label="Conversation details">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <DisplayName name={conversation.peer.username} creator={conversation.peer.isCreator} premium={hasPremium(conversation.peer)} className="text-sm font-semibold" />
                <p className="mt-1 text-xs text-mist">{status}</p>
                {conversation.peer.favouriteAnime ? <p className="mt-2 text-xs text-mist">{conversation.peer.favouriteAnime}</p> : null}
              </div>
              <button type="button" className={iconButton} aria-label="Close details" onClick={() => setInfoOpen(false)}>
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="h-9 flex-1 rounded-lg border border-line px-2 text-xs font-medium"
                onClick={() => void act(conversation.blockedByMe ? chat.unblockUser(conversation.peer.id) : chat.blockUser(conversation.peer.id))}
              >
                {conversation.blockedByMe ? 'Unblock' : 'Block'}
              </button>
              <button
                type="button"
                className="h-9 flex-1 rounded-lg border border-line px-2 text-xs font-medium"
                onClick={() => setReporting({ id: conversation.peer.id, username: conversation.peer.username })}
              >
                Report
              </button>
            </div>
          </div>
        ) : null}
      </header>
      {searchOpen ? (
        <div className="flex items-center gap-2 border-b border-line bg-panel px-3 py-2">
          <input
            className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-elevated px-3 text-sm outline-none focus:border-sakura focus:ring-2 focus:ring-sakura/30"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setMatchIndex(0)
            }}
            placeholder="Search messages"
            aria-label="Search messages"
          />
          <span className="shrink-0 text-xs text-mist">{matches.length === 0 ? '0' : `${matchIndex + 1}/${matches.length}`}</span>
          <button type="button" className={iconButton} aria-label="Previous match" onClick={() => setMatchIndex((index) => (matches.length === 0 ? 0 : (index - 1 + matches.length) % matches.length))}>
            <DownIcon className="h-4 w-4 rotate-180" />
          </button>
          <button type="button" className={iconButton} aria-label="Next match" onClick={() => setMatchIndex((index) => (matches.length === 0 ? 0 : (index + 1) % matches.length))}>
            <DownIcon className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <div ref={scroller} className="chat-stream min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-6" onScroll={onScroll}>
        {chat.messagesLoading ? <MessageSkeleton /> : null}
        {!chat.messagesLoading && chat.messages.length === 0 && calls.length === 0 ? (
          <p className="mx-auto mt-16 max-w-xs text-center text-sm leading-6 text-mist">No messages yet. Say hello, send a photo, or tap the mic for a voice note.</p>
        ) : null}
        {[
          ...chat.messages.map((message) => ({ kind: 'message' as const, at: message.createdAt, message })),
          ...calls.map((entry) => ({ kind: 'call' as const, at: entry.endedAt, call: entry })),
        ]
          .sort((a, b) => a.at.localeCompare(b.at))
          .map((item) => {
          const day = dayKey(item.at)
          const showDay = day !== lastDay
          lastDay = day
          if (item.kind === 'call') {
            return (
              <div key={item.call.id} className="my-2.5">
                {showDay ? (
                  <div className="sticky top-2 z-10 my-3 flex justify-center">
                    <span className="day-chip rounded-full border border-line bg-panel/95 px-3 py-1 text-[11px] font-medium text-mist shadow-sm backdrop-blur">
                      {formatDayLabel(item.at)}
                    </span>
                  </div>
                ) : null}
                <div className="flex justify-center">
                  <CallLogLine call={item.call} meId={profile?.id ?? ''} at={item.at} />
                </div>
              </div>
            )
          }
          const message = item.message
          const index = chat.messages.indexOf(message)
          const mine = message.senderId === profile?.id
          const sender = members.find((member) => member.id === message.senderId)
          const senderName = mine ? profile?.username ?? '' : sender?.username ?? (group ? 'member' : conversation.peer.username)
          const senderCreator = mine ? Boolean(profile?.isCreator) : Boolean(sender ? sender.isCreator : group ? false : conversation.peer.isCreator)
          const senderPremium = mine ? hasPremium(profile) : sender ? hasPremium(sender) : group ? false : hasPremium(conversation.peer)
          const pos = groupPosition(chat.messages, index)
          const hit = Boolean(query) && !message.deletedAt && message.body.toLowerCase().includes(query)
          return (
            <div key={message.id} data-message-id={message.id} className={pos === 'start' || pos === 'single' ? 'msg-cluster mt-2.5 first:mt-0' : 'msg-follow mt-0.5'}>
              {showDay ? (
                <div className="sticky top-2 z-10 my-3 flex justify-center">
                  <span className="day-chip rounded-full border border-line bg-panel/95 px-3 py-1 text-[11px] font-medium text-mist shadow-sm backdrop-blur">
                    {formatDayLabel(message.createdAt)}
                  </span>
                </div>
              ) : null}
              {dividerId === message.id ? (
                <p className="my-3 text-center text-[11px] font-medium uppercase tracking-[0.14em] text-sakura">New messages</p>
              ) : null}
              <MessageRow
                message={message}
                mine={mine}
                forgerChat={conversationUsesForgerBubbles(conversation.id)}
                pos={pos}
                meId={profile?.id ?? ''}
                senderName={senderName}
                senderCreator={senderCreator}
                senderPremium={senderPremium}
                showSender={showSenderName(mine, group)}
                highlighted={hit}
                receiptsShared={conversation.peer.showReadReceipts !== false}
                menuOpen={menuId === message.id}
                menuAnchor={menuId === message.id ? menuPoint : null}
                reactOpen={reactId === message.id}
                actionsOpen={actionsId === message.id}
                onOpenMenu={() => {
                  setMenuId((current) => (current === message.id ? null : message.id))
                  setMenuPoint(null)
                  setReactId(null)
                }}
                onShowMenu={(x, y) => {
                  setMenuId(message.id)
                  setMenuPoint({ x, y })
                  setActionsId(null)
                  setReactId(null)
                }}
                onReply={() => {
                  setReply({ id: message.id, preview: messagePreview(message).slice(0, 80) })
                  setMenuId(null)
                  setMenuPoint(null)
                  setActionsId(null)
                }}
                onReact={() => setReactId((current) => (current === message.id ? null : message.id))}
                onCopy={() => void copyMessage(message)}
                onHide={() => void act(chat.hideMessage(message.id))}
                onDelete={() => void act(chat.deleteForEveryone(message))}
                onEdit={() => {
                  setEditing({ id: message.id, body: message.body })
                  setReply(null)
                  setMenuId(null)
                  setMenuPoint(null)
                  setActionsId(null)
                }}
                onToggleReaction={(emoji) => {
                  setReactId(null)
                  void act(chat.react(message.id, emoji))
                }}
                onOpenImage={(src) => setLightbox(src)}
                onOpenSender={showSenderName(mine, group) && sender ? () => openProfile(profileFromMember(sender), 'group') : undefined}
              />
            </div>
          )
        })}
        {typing ? (
          <div className="mt-2 mr-auto max-w-[min(78%,26rem)]" aria-live="polite">
            <div className="bubble-other inline-flex items-center gap-1 rounded-[18px] rounded-bl-[4px] px-3 py-2.5 text-mist">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="sr-only">typing…</span>
            </div>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      {showJump ? (
        <button
          type="button"
          className="absolute bottom-24 right-4 z-20 grid h-10 min-w-10 place-items-center rounded-full border border-line bg-panel px-2 text-paper shadow-md"
          aria-label={jumpCount > 0 ? `Jump to latest, ${jumpCount} new` : 'Jump to latest'}
          onClick={jumpToBottom}
        >
          <DownIcon className="h-5 w-5" />
          {jumpCount > 0 ? <span className="absolute -top-1.5 right-0 grid h-5 min-w-5 place-items-center rounded-full bg-sakura px-1 text-[10px] font-semibold text-white">{jumpCount}</span> : null}
        </button>
      ) : null}
      {actionError ? <p className="px-4 pb-1 text-sm text-danger">{actionError}</p> : null}
      {pendingRequest ? (
        <div className="border-t border-line bg-panel px-4 py-3 text-sm leading-6 text-mist">
          You can message and call once the contact request is accepted.
        </div>
      ) : conversation.blocked ? (
        <div className="border-t border-line bg-panel px-4 py-3 text-sm leading-6 text-mist">
          {conversation.blockedByMe ? (
            <>
              You blocked @{conversation.peer.username}. Messages and calls stay off until you unblock them.{' '}
              <button type="button" className="font-medium text-paper underline-offset-2 hover:underline" onClick={() => void act(chat.unblockUser(conversation.peer.id))}>
                Unblock
              </button>
            </>
          ) : (
            <>You can&apos;t message or call @{conversation.peer.username}.</>
          )}
        </div>
      ) : (
      <div className="composer-dock px-2 pb-2 pt-1 sm:px-4">
        <Composer
          key={conversation.id}
          peerName={group ? title : `@${conversation.peer.username}`}
          reply={reply}
          editing={editing}
          onCancelEdit={() => setEditing(null)}
          onClearReply={() => setReply(null)}
          incomingFile={dropFile}
          onIncomingHandled={() => setDropFile(null)}
          onTyping={(active) => chat.broadcastTyping(conversation.id, active)}
          onSendText={async (body) => {
            nearBottom.current = true
            if (editing) {
              await chat.editMessage(editing.id, body)
              setEditing(null)
              return
            }
            await chat.send(conversation.id, body, reply)
            setReply(null)
          }}
          onSendFile={async (file, mime, kind, seconds, waveform, caption, hooks) => {
            nearBottom.current = true
            await chat.sendMedia({
              conversationId: conversation.id,
              kind,
              file,
              mime,
              seconds,
              waveform,
              reply,
              caption,
              onProgress: hooks?.onProgress,
              signal: hooks?.signal,
            })
            setReply(null)
          }}
        />
      </div>
      )}
      {profilePerson ? (
        <ProfileSheet
          person={profilePerson}
          meId={profile?.id ?? ''}
          sourceConversationId={conversation.id}
          directPeerIds={group ? directPeerIds : [...directPeerIds, profilePerson.id]}
          groupMemberIds={group ? members.map((member) => member.id) : []}
          onClose={() => setProfilePerson(null)}
          onReport={(person) => setReporting({ id: person.id, username: person.username })}
        />
      ) : null}
      {reporting ? (
        <ReportDialog
          username={reporting.username}
          onClose={() => setReporting(null)}
          onSubmit={async (reason, details) => {
            await chat.reportUser(reporting.id, reason, details, conversation.id)
            chat.pushToast('Report sent')
          }}
        />
      ) : null}
      {lightbox ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-label="Photo" data-testid="lightbox" onClick={() => setLightbox(null)}>
          <button type="button" className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white" aria-label="Close photo" onClick={() => setLightbox(null)}>
            <CloseIcon className="h-5 w-5" />
          </button>
          <img src={lightbox} alt="Photo" className="max-h-[85vh] max-w-full rounded-xl object-contain" onClick={(event) => event.stopPropagation()} />
        </div>
      ) : null}
    </div>
  )
}

function placeMenu(x: number, y: number, canEdit: boolean): { position: 'fixed'; top: number; left: number } {
  const width = 208
  const height = (canEdit ? 6 : 5) * 40 + 8
  const left = Math.max(8, Math.min(x, window.innerWidth - width - 8))
  const top = y + height > window.innerHeight - 8 ? Math.max(8, y - height) : y
  return { position: 'fixed', top, left }
}

function MessageRow({
  message,
  mine,
  forgerChat,
  pos,
  meId,
  senderName,
  senderCreator,
  senderPremium,
  showSender,
  highlighted,
  receiptsShared,
  menuOpen,
  menuAnchor,
  reactOpen,
  actionsOpen,
  onOpenMenu,
  onShowMenu,
  onReply,
  onReact,
  onCopy,
  onHide,
  onDelete,
  onEdit,
  onToggleReaction,
  onOpenImage,
  onOpenSender,
}: {
  message: Message
  mine: boolean
  forgerChat: boolean
  pos: GroupPos
  meId: string
  senderName: string
  senderCreator: boolean
  senderPremium: boolean
  showSender: boolean
  highlighted: boolean
  receiptsShared: boolean
  menuOpen: boolean
  menuAnchor: { x: number; y: number } | null
  reactOpen: boolean
  actionsOpen: boolean
  onOpenMenu: () => void
  onShowMenu: (x: number, y: number) => void
  onReply: () => void
  onReact: () => void
  onCopy: () => void
  onHide: () => void
  onDelete: () => void
  onEdit: () => void
  onToggleReaction: (emoji: string) => void
  onOpenImage: (src: string) => void
  onOpenSender?: () => void
}) {
  const deleted = Boolean(message.deletedAt)
  const tick = receiptTick(message, receiptsShared)
  const tailed = !deleted && (pos === 'single' || pos === 'end')
  const radius = mine
    ? tailed ? 'rounded-[18px] rounded-br-[5px]' : 'rounded-[18px]'
    : tailed ? 'rounded-[18px] rounded-bl-[5px]' : 'rounded-[18px]'
  const image = !deleted && message.kind === 'image'
  const video = !deleted && message.kind === 'video'
  const forger = forgerChat && !deleted && !image && !video
  const featured = (senderCreator || senderPremium) && !deleted
  const ownTone = mine || featured || forger
  const reactions = groupedReactions(message.reactions, meId)
  const parts = linkParts(message.body)
  const firstLink = parts.find((part) => part.type === 'link')?.value
  const bubble = forger
    ? 'bubble-forger'
    : senderCreator && !deleted
      ? 'bubble-creator'
      : senderPremium && !deleted
        ? 'bubble-premium'
        : mine
          ? 'bubble-own'
          : 'bubble-other'
  const tail = forger || featured || !tailed ? '' : mine ? 'tail-own' : 'tail-other'
  const cancelPress = useRef<(() => void) | null>(null)

  useEffect(() => () => cancelPress.current?.(), [])

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || deleted) return
    const target = event.target
    if (!(target instanceof Element) || target.closest('a, button, input, textarea, label, video, [role="menuitem"], .msg-actions')) return
    const startX = event.clientX
    const startY = event.clientY
    const timer = window.setTimeout(() => {
      stop()
      window.getSelection()?.removeAllRanges()
      onShowMenu(startX, startY)
    }, 450)
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
    <div
      className={`msg-group relative flex w-fit min-w-0 max-w-[min(80%,26rem)] flex-col ${mine ? 'ml-auto items-end' : 'mr-auto items-start'} ${actionsOpen ? 'is-actions-open' : ''}`}
      onPointerDown={onPointerDown}
      onContextMenu={(event) => {
        event.preventDefault()
        if (deleted) return
        onShowMenu(event.clientX, event.clientY)
      }}
    >
      {(pos === 'start' || pos === 'single') && showSender ? (
        onOpenSender ? (
          <button type="button" className="msg-sender mb-0.5 px-1 text-left text-[11px] font-medium" aria-label={`View @${senderName}`} onClick={onOpenSender}>
            <DisplayName name={senderName} creator={senderCreator} premium={senderPremium} className="text-[11px] font-medium" />
          </button>
        ) : (
          <DisplayName name={senderName} creator={senderCreator} premium={senderPremium} className="msg-sender mb-0.5 px-1 text-[11px] font-medium text-mist" />
        )
      ) : null}
      {!deleted ? (
        <div className={`msg-actions absolute top-1 z-10 flex gap-0.5 rounded-full border border-line bg-panel p-0.5 shadow-sm ${mine ? 'right-1' : 'left-1'}`} hidden={!actionsOpen}>
          <Tiny label="Reply" onClick={onReply}><ReplyIcon className="h-3.5 w-3.5" /></Tiny>
          <Tiny label="React" onClick={onReact}><SmileIcon className="h-3.5 w-3.5" /></Tiny>
          <Tiny label="Copy" onClick={onCopy}><CopyIcon className="h-3.5 w-3.5" /></Tiny>
          <Tiny label="Delete" onClick={onOpenMenu}><TrashIcon className="h-3.5 w-3.5" /></Tiny>
        </div>
      ) : null}
      <div className={`relative min-w-0 max-w-full ${highlighted ? 'rounded-[18px] ring-2 ring-sakura/70' : ''}`}>
        {forger ? <ForgerAnya mine={mine} /> : null}
        <div data-forger-bubble={forger ? 'true' : undefined} data-creator-bubble={!forger && senderCreator && !deleted ? 'true' : undefined} data-premium-bubble={!forger && senderPremium && !senderCreator && !deleted ? 'true' : undefined} className={`msg-bubble ${bubble} bubble-in relative min-w-0 max-w-full text-left ${radius} ${(image || video) && !featured ? 'overflow-hidden p-1' : 'bubble-pad'} ${tail}`}>
          {message.replyPreview && !deleted ? (
            <p className={`reply-quote mb-1 rounded-md border-l-2 px-2 py-1 text-xs ${ownTone ? 'border-white/70 bg-black/10 text-white/85' : 'border-sakura bg-black/5 text-mist'}`}>
              {message.replyPreview}
            </p>
          ) : null}
          {deleted ? (
            <p className="msg-copy text-sm italic leading-5 opacity-80">
              This message was deleted
              <Meta mine={ownTone} createdAt={message.createdAt} tick={tick} showTick={false} />
            </p>
          ) : null}
          {image ? (
            message.mediaUrl ? (
              <div className="msg-media-frame">
                <button type="button" className="block max-w-full" aria-label="Open photo" onClick={() => onOpenImage(message.mediaUrl as string)}>
                  <img src={message.mediaUrl} alt={message.body && message.body !== 'Photo' ? message.body : 'Photo'} className="max-h-72 max-w-full rounded-[14px] object-cover" />
                </button>
                {message.body.trim() === 'Photo' ? <Meta mine={ownTone} createdAt={message.createdAt} tick={tick} showTick={mine} onMedia /> : null}
              </div>
            ) : (
              <p className="msg-copy text-sm leading-5">
                Photo
                <Meta mine={ownTone} createdAt={message.createdAt} tick={tick} showTick={mine} />
              </p>
            )
          ) : null}
          {video ? (
            message.mediaUrl ? (
              <div className="msg-media-frame">
                <VideoBubble src={message.mediaUrl} seconds={message.mediaSeconds} />
                {message.body.trim() === 'Video' ? <Meta mine={ownTone} createdAt={message.createdAt} tick={tick} showTick={mine} onMedia /> : null}
              </div>
            ) : (
              <p className="msg-copy text-sm leading-5">
                Video
                <Meta mine={ownTone} createdAt={message.createdAt} tick={tick} showTick={mine} />
              </p>
            )
          ) : null}
          {(image && message.body.trim() && message.body.trim() !== 'Photo') || (video && message.body.trim() && message.body.trim() !== 'Video') ? (
            <p className="msg-copy px-1.5 pt-1 text-sm leading-5">
              <span className="whitespace-pre-wrap">{message.body}</span>
              <Meta mine={ownTone} createdAt={message.createdAt} tick={tick} showTick={mine} edited={Boolean(message.editedAt)} />
            </p>
          ) : null}
          {!deleted && message.kind === 'voice' ? (
            <div className="msg-voice flex items-end gap-2">
              <VoiceBubble src={message.mediaUrl} seconds={message.mediaSeconds} waveform={message.waveform} mine={ownTone} />
              <Meta mine={ownTone} createdAt={message.createdAt} tick={tick} showTick={mine} />
            </div>
          ) : null}
          {!deleted && message.kind !== 'voice' && message.kind !== 'image' && message.kind !== 'video' ? (
            <div>
              <p className="msg-copy text-sm leading-5">
                {parts.map((part, index) =>
                  part.type === 'link' ? (
                    <a key={`${part.value}-${index}`} href={part.value} target="_blank" rel="noreferrer" className={`whitespace-pre-wrap ${ownTone ? 'underline decoration-white/70 underline-offset-2' : 'text-sakura underline underline-offset-2'}`}>
                      {part.value}
                    </a>
                  ) : (
                    <span key={`${index}-${part.value.slice(0, 8)}`} className="whitespace-pre-wrap">{part.value}</span>
                  ),
                )}
                <Meta mine={ownTone} createdAt={message.createdAt} tick={tick} showTick={mine && !deleted} edited={Boolean(message.editedAt)} />
              </p>
              {firstLink ? (
                <a href={firstLink} target="_blank" rel="noreferrer" className={ownTone ? 'mt-1 block rounded-lg bg-black/15 px-2 py-1.5 text-xs text-white/90' : 'mt-1 block rounded-lg bg-black/[0.04] px-2 py-1.5 text-xs text-mist'}>
                  <span className="block font-medium">{linkHost(firstLink)}</span>
                  <span className="block truncate opacity-80">{firstLink}</span>
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
        {reactions.length > 0 ? (
          <div className={`msg-reactions mt-1 flex flex-wrap gap-1 ${mine ? 'justify-end' : ''}`}>
            {reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                type="button"
                className={`rounded-full border px-1.5 py-0.5 text-xs ${reaction.mine ? 'border-sakura bg-sakura/15' : 'border-line bg-panel'}`}
                aria-label={`${reaction.emoji} ${reaction.count}`}
                onClick={() => onToggleReaction(reaction.emoji)}
              >
                {reaction.emoji} {reaction.count}
              </button>
            ))}
          </div>
        ) : null}
        {reactOpen && !deleted ? (
          <div className={`absolute z-20 mt-1 flex gap-1 rounded-full border border-line bg-panel p-1 shadow-md ${mine ? 'right-0' : 'left-0'}`} role="listbox" aria-label="Reactions">
            {QUICK_REACTIONS.map((emoji) => (
              <button key={emoji} type="button" className="hover-wash grid h-8 w-8 place-items-center rounded-full text-base" onClick={() => onToggleReaction(emoji)}>
                {emoji}
              </button>
            ))}
          </div>
        ) : null}
        {menuOpen && !deleted ? (
          <div
            className={`z-40 w-52 rounded-xl border border-line bg-panel p-1 shadow-md ${menuAnchor ? '' : `absolute mt-1 ${mine ? 'right-0' : 'left-0'}`}`}
            style={menuAnchor ? placeMenu(menuAnchor.x, menuAnchor.y, mine && (!message.kind || message.kind === 'text')) : undefined}
            role="menu"
            data-message-menu="true"
          >
            {mine && (!message.kind || message.kind === 'text') ? (
              <button type="button" role="menuitem" className="hover-wash block w-full rounded-lg px-3 py-2 text-left text-sm" onClick={onEdit}>Edit</button>
            ) : null}
            <button type="button" role="menuitem" className="hover-wash block w-full rounded-lg px-3 py-2 text-left text-sm" onClick={onReply}>Reply</button>
            <button type="button" role="menuitem" className="hover-wash block w-full rounded-lg px-3 py-2 text-left text-sm" onClick={onReact}>React</button>
            <button type="button" role="menuitem" className="hover-wash block w-full rounded-lg px-3 py-2 text-left text-sm" onClick={onCopy}>Copy</button>
            <button type="button" role="menuitem" className="hover-wash block w-full rounded-lg px-3 py-2 text-left text-sm" onClick={onHide}>Delete for me</button>
            {mine ? (
              <button type="button" role="menuitem" className="hover-wash block w-full rounded-lg px-3 py-2 text-left text-sm text-danger" onClick={onDelete}>Delete for everyone</button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ForgerAnya({ mine }: { mine: boolean }) {
  return (
    <span className={`forger-anya${mine ? ' is-mine' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 64 86" width="25" height="34">
        <g className="forger-anya-legs">
          <path d="M23 48c-.5 8-.2 16 .7 24 1.4.6 3.8.4 4.6-.8.6-7.4.1-16-.6-23.4-1.4-.2-3.4-.2-4.7.2z" fill="#ffd3c2" />
          <path d="M22.2 68.5c.3 3 1.8 5 4.4 5 2.6 0 4.2-1.8 4-4.2-.2-1.6-1.6-2.8-3.6-3-2.4-.2-4.6.2-4.8 2.2z" fill="#22181c" />
          <path d="M36.2 48c.5 8 .2 16-.7 24-1.4.6-3.8.4-4.6-.8-.6-7.4-.1-16.6.6-23.4 1.4-.2 3.4-.2 4.7.2z" fill="#ffd3c2" />
          <path d="M33.6 69c.3 2.8 1.8 4.6 4.4 4.6s4-1.8 3.8-4.4c-.2-1.6-1.6-2.6-3.6-2.6-2.4 0-4.4.4-4.6 2.4z" fill="#22181c" />
        </g>
        <path d="M17 44c1.2-6.4 5.6-10 15-10s13.8 3.6 15 10c1.2 3.6.2 7.2-2.4 9.2-3.2 2.4-7.4 3.1-12.6 3.1s-9.4-.7-12.6-3.1c-2.6-2-3.6-5.6-2.4-9.2z" fill="#1b1418" />
        <path d="M21 51.6c3.4 2.2 7.4 3.2 11 3.2s7.6-1 11-3.2" fill="none" stroke="#e6c36a" strokeWidth="1.25" strokeLinecap="round" />
        <path d="M26.4 38.2h11.2l-2 4.6h-7.2z" fill="#fffaf6" />
        <path d="M32 38.4v4.2" stroke="#e6c36a" strokeWidth="0.7" />
        <circle cx="32" cy="46.4" r="1.2" fill="#f3d48a" />
        <circle cx="32" cy="49.4" r="1.2" fill="#f3d48a" />
        <ellipse cx="17.2" cy="45.6" rx="3.3" ry="2.2" fill="#ffd3c2" />
        <ellipse cx="46.8" cy="45.6" rx="3.3" ry="2.2" fill="#ffd3c2" />
        <circle cx="32" cy="24" r="13.2" fill="#ffd3c2" />
        <path d="M18.4 25.2C19 14.2 24.6 8 32 8s13 6.2 13.6 17.2c-.7-3.2-3-5.8-6.6-6.6-1.4 3.6-3.6 5.2-7 5.2s-5.6-1.6-7-5.2c-3.6.8-5.9 3.4-6.6 6.6z" fill="#ef6f98" />
        <path d="M18.6 23c-1.2 6.4.4 11.4 3.2 13.4-2.6-3.6-3-8.6-2-13.4z" fill="#e25b8a" />
        <path d="M45.4 23c1.2 6.4-.4 11.4-3.2 13.4 2.6-3.6 3-8.6 2-13.4z" fill="#e25b8a" />
        <path d="M21.6 12.4 24.2 5l3.2 5.8c-1.6.6-3.8.9-5.8 1.6z" fill="#22181c" />
        <path d="M42.4 12.4 39.8 5l-3.2 5.8c1.6.6 3.8.9 5.8 1.6z" fill="#22181c" />
        <ellipse cx="26.6" cy="25.6" rx="2.2" ry="2.5" fill="#fff" />
        <ellipse cx="37.4" cy="25.6" rx="2.2" ry="2.5" fill="#fff" />
        <circle cx="26.9" cy="26" r="1.45" fill="#2f9a58" />
        <circle cx="37.7" cy="26" r="1.45" fill="#2f9a58" />
        <circle cx="26.9" cy="26.1" r="0.72" fill="#173d28" />
        <circle cx="37.7" cy="26.1" r="0.72" fill="#173d28" />
        <circle cx="27.4" cy="25.5" r="0.4" fill="#fff" />
        <circle cx="38.2" cy="25.5" r="0.4" fill="#fff" />
        <g className="forger-anya-blink">
          <ellipse cx="26.6" cy="25.8" rx="2.6" ry="2.2" fill="#ffd3c2" />
          <ellipse cx="37.4" cy="25.8" rx="2.6" ry="2.2" fill="#ffd3c2" />
        </g>
        <path d="M29.2 30c.8 1.1 2.2 1.5 2.8 1.5s2-.4 2.8-1.5" fill="none" stroke="#d48984" strokeWidth="0.85" strokeLinecap="round" />
        <ellipse cx="22.8" cy="28.8" rx="1.6" ry="0.85" fill="#f3a0a8" opacity="0.75" />
        <ellipse cx="41.2" cy="28.8" rx="1.6" ry="0.85" fill="#f3a0a8" opacity="0.75" />
      </svg>
    </span>
  )
}

function Meta({
  mine,
  createdAt,
  tick,
  showTick,
  edited = false,
  onMedia = false,
}: {
  mine: boolean
  createdAt: string
  tick: string
  showTick: boolean
  edited?: boolean
  onMedia?: boolean
}) {
  return (
    <span className={`msg-meta text-[11px] ${onMedia ? 'msg-meta-on-media' : ''} ${mine ? 'text-white/75' : 'text-mist'}`}>
      {edited ? <span>edited</span> : null}
      <time dateTime={createdAt}>{formatMessageTime(createdAt)}</time>
      {showTick ? (
        <span title={tick} aria-label={tick}>
          <CheckIcon className={`h-3.5 w-3.5 ${tick === 'seen' ? 'text-white' : 'opacity-70'}`} double={tick !== 'sent'} />
        </span>
      ) : null}
    </span>
  )
}

function Tiny({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} className="hover-wash grid h-7 w-7 place-items-center rounded-full text-mist hover:text-paper" onClick={onClick}>
      {children}
    </button>
  )
}

function MessageSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <span className="skeleton block h-10 w-40 rounded-2xl" />
      <span className="skeleton ml-auto block h-14 w-52 rounded-2xl" />
      <span className="skeleton block h-10 w-48 rounded-2xl" />
    </div>
  )
}

export function Welcome() {
  return (
    <div className="chat-wallpaper wallpaper-plain grid h-full place-items-center px-8 text-center">
      <div>
        <EmptyArt />
        <p className="mt-4 text-lg font-semibold tracking-tight">Select a chat</p>
        <p className="mx-auto mt-1 max-w-xs text-sm leading-6 text-mist">
          Messages, photos, and voice notes show up here. Start one from the list.
        </p>
      </div>
    </div>
  )
}

function CallLogLine({ call, meId, at }: { call: CallLog; meId: string; at: string }) {
  const missed = call.status === 'missed'
  return (
    <p className={`call-log inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs ${missed ? 'call-log-missed' : ''}`}>
      <PhoneIcon className="h-3.5 w-3.5 shrink-0" />
      <span>{callLogLabel({ ...call, meId })}</span>
      <span className="call-log-time">{formatMessageTime(at)}</span>
    </p>
  )
}

function EmptyArt() {
  return (
    <svg className="mx-auto h-24 w-24 text-mist" viewBox="0 0 96 96" fill="none" aria-hidden="true">
      <rect x="14" y="22" width="52" height="36" rx="16" stroke="currentColor" strokeWidth="2.5" />
      <path d="M28 58l-6 10 16-10" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="34" y="40" width="44" height="30" rx="14" fill="color-mix(in oklab, var(--accent) 18%, transparent)" stroke="currentColor" strokeWidth="2.5" />
      <path d="M46 52h20M46 59h12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}
