import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { appendMessage, foldConversation } from '../lib/conversations'
import { messagePreview } from '../lib/messages'
import { desktopNotice, playMessageTone } from '../lib/notify'
import type { BlockedPerson, ChatPrefPatch, ContactRequest, Conversation, GroupMember, MemberRole, Message, OutgoingMedia, ReactionChange, ReplyTarget, SearchPerson, UserReport } from '../types'
import { useSession } from './SessionContext'

type Toast = { id: string; text: string }

type ChatValue = {
  conversations: Conversation[]
  messages: Message[]
  loading: boolean
  messagesLoading: boolean
  error: string | null
  activeId: string | null
  toasts: Toast[]
  dismissToast: (id: string) => void
  pushToast: (text: string) => void
  setActive: (id: string | null) => void
  refresh: () => Promise<void>
  search: (query: string) => Promise<SearchPerson[]>
  requests: ContactRequest[]
  incomingRequests: number
  requestContact: (userId: string) => Promise<void>
  acceptRequest: (requestId: string) => Promise<string>
  declineRequest: (requestId: string) => Promise<void>
  cancelRequest: (requestId: string) => Promise<void>
  startChat: (userId: string) => Promise<string>
  send: (conversationId: string, body: string, reply?: ReplyTarget | null) => Promise<void>
  sendMedia: (input: OutgoingMedia) => Promise<void>
  hideMessage: (messageId: string) => Promise<void>
  deleteForEveryone: (message: Message) => Promise<void>
  editMessage: (messageId: string, body: string) => Promise<void>
  blockUser: (userId: string) => Promise<void>
  unblockUser: (userId: string) => Promise<void>
  listBlocked: () => Promise<BlockedPerson[]>
  reportUser: (userId: string, reason: string, details: string, conversationId?: string | null) => Promise<void>
  listReports: () => Promise<UserReport[]>
  setChatPref: (conversationId: string, patch: ChatPrefPatch) => Promise<void>
  createGroup: (title: string, memberIds: string[]) => Promise<string>
  listMembers: (conversationId: string) => Promise<GroupMember[]>
  addMember: (conversationId: string, userId: string) => Promise<void>
  removeMember: (conversationId: string, userId: string) => Promise<void>
  setMemberRole: (conversationId: string, userId: string, role: MemberRole) => Promise<void>
  renameGroup: (conversationId: string, title: string) => Promise<void>
  setGroupPhoto: (conversationId: string, file: Blob) => Promise<void>
  leaveGroup: (conversationId: string) => Promise<void>
  deleteGroup: (conversationId: string) => Promise<void>
  broadcastTyping: (conversationId: string) => void
  subscribeTyping: (conversationId: string, onTyping: (userId: string) => void) => () => void
  react: (messageId: string, emoji: string) => Promise<void>
}

const ChatContext = createContext<ChatValue | null>(null)

export function ChatProvider({ children }: { children: ReactNode }) {
  const { chat, profile } = useSession()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [requests, setRequests] = useState<ContactRequest[]>([])
  const seenRequests = useRef(new Set<string>())
  const requestsReady = useRef(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const activeRef = useRef<string | null>(null)
  const seen = useRef(new Set<string>())
  const conversationsRef = useRef(conversations)
  const profileRef = useRef(profile)
  conversationsRef.current = conversations
  profileRef.current = profile
  const me = profile?.id ?? ''

  const pushToast = useCallback((text: string) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    setToasts((prev) => [...prev.slice(-3), { id, text }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id))
    }, 4200)
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const refresh = useCallback(async () => {
    const rows = await chat.listConversations()
    setConversations(rows)
  }, [chat])

  const applyUpdate = useCallback((message: Message) => {
    setMessages((prev) =>
      prev.map((item) =>
        item.id === message.id
          ? {
              ...item,
              ...message,
              mediaUrl: message.mediaUrl ?? item.mediaUrl,
              readAt: message.readAt ?? item.readAt,
              deliveredAt: message.deliveredAt ?? item.deliveredAt,
            }
          : item,
      ),
    )
    setConversations((prev) =>
      prev.map((item) => {
        if (item.id !== message.conversationId || !item.lastMessage) return item
        if (item.lastMessage.createdAt > message.createdAt) return item
        return {
          ...item,
          lastMessage: {
            body: messagePreview(message),
            createdAt: message.createdAt,
            senderId: message.senderId,
            readAt: message.readAt ?? item.lastMessage.readAt,
            deliveredAt: message.deliveredAt ?? item.lastMessage.deliveredAt ?? null,
          },
        }
      }),
    )
  }, [])

  const ingest = useCallback(
    async (message: Message) => {
      let ready = message
      try {
        ready = await chat.attachMedia(message)
      } catch {
        ready = message
      }
      if (seen.current.has(ready.id)) {
        applyUpdate(ready)
        return
      }
      seen.current.add(ready.id)
      setMessages((prev) => (activeRef.current === ready.conversationId ? appendMessage(prev, ready) : prev))
      setConversations((prev) => {
        const next = foldConversation(prev, ready, me, activeRef.current)
        if (!next) {
          void refresh()
          return prev
        }
        return next
      })
      const mine = ready.senderId === me
      const viewing = activeRef.current === ready.conversationId
      if (viewing && !mine) {
        void chat.markRead(ready.conversationId).then(() => {
          setConversations((prev) => prev.map((item) => (item.id === ready.conversationId ? { ...item, unread: 0 } : item)))
        })
      }
      if (!mine && !viewing && !ready.deletedAt) {
        const convo = conversationsRef.current.find((item) => item.id === ready.conversationId)
        if (!convo?.muted) {
          const prefs = profileRef.current
          const peer = convo?.kind === 'group' ? convo.title || 'Group' : convo?.peer.username
          const preview = messagePreview(ready)
          if (prefs?.notifySound !== false) playMessageTone()
          if (prefs?.notifyDesktop !== false) void desktopNotice(peer ? (convo?.kind === 'group' ? peer : `@${peer}`) : 'Athera Talks', preview)
          pushToast(peer ? `New message from ${convo?.kind === 'group' ? peer : `@${peer}`}` : 'New message')
        }
      }
    },
    [applyUpdate, chat, me, pushToast, refresh],
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    chat
      .listConversations()
      .then((rows) => {
        if (!cancelled) {
          setConversations(rows)
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load chats.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [chat])

  useEffect(() => {
    return chat.subscribe({
      onInsert: (message) => {
        void ingest(message)
      },
      onUpdate: (message) => {
        void chat.attachMedia(message).then(applyUpdate).catch(() => applyUpdate(message))
      },
      onReceipt: (receipt) => {
        setMessages((prev) =>
          prev.map((item) =>
            item.id === receipt.messageId ? { ...item, readAt: receipt.readAt, deliveredAt: receipt.deliveredAt } : item,
          ),
        )
        void refresh()
      },
    })
  }, [applyUpdate, chat, ingest, refresh])

  useEffect(() => {
    if (!profile) return
    const beat = () => {
      void chat.touchPresence().catch(() => undefined)
      void chat
        .markDelivered()
        .then(() => refresh())
        .catch(() => undefined)
    }
    beat()
    const id = window.setInterval(beat, 20_000)
    return () => window.clearInterval(id)
  }, [chat, profile, refresh])

  useEffect(() => {
    if (!activeId) {
      setMessages([])
      return
    }
    let cancelled = false
    setMessagesLoading(true)
    chat
      .listMessages(activeId)
      .then((rows) => {
        if (cancelled) return
        rows.forEach((message) => seen.current.add(message.id))
        setMessages(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load messages.')
      })
      .finally(() => {
        if (!cancelled) setMessagesLoading(false)
      })
    void chat.markRead(activeId).then(() => {
      if (cancelled) return
      setConversations((prev) => prev.map((item) => (item.id === activeId ? { ...item, unread: 0 } : item)))
    })
    return () => {
      cancelled = true
    }
  }, [activeId, chat])

  const setActive = useCallback((id: string | null) => {
    activeRef.current = id
    setActiveId(id)
  }, [])

  const applyRequests = useCallback((rows: ContactRequest[], announce: boolean) => {
    const me = profileRef.current?.id
    if (announce && me) {
      for (const request of rows) {
        if (request.status === 'pending' && request.toId === me && !seenRequests.current.has(request.id)) {
          pushToast(`Contact request from @${request.peer.username}`)
          const prefs = profileRef.current
          if (prefs?.notifySound !== false) playMessageTone()
          if (prefs?.notifyDesktop !== false) void desktopNotice('Contact request', `@${request.peer.username} wants to connect`)
        }
      }
    }
    rows.forEach((request) => seenRequests.current.add(request.id))
    requestsReady.current = true
    setRequests(rows)
  }, [pushToast])

  const loadRequests = useCallback(async () => {
    const rows = await chat.listRequests()
    applyRequests(rows, requestsReady.current)
  }, [applyRequests, chat])

  useEffect(() => {
    if (!profile) return
    let stop = () => {}
    let cancelled = false
    void chat.listRequests().then((rows) => {
      if (cancelled) return
      applyRequests(rows, false)
      stop = chat.subscribeRequests(() => {
        void chat.listRequests().then((next) => {
          applyRequests(next, true)
          void refresh()
        }).catch(() => undefined)
      })
      void chat.listRequests().then((next) => {
        if (!cancelled) applyRequests(next, true)
      }).catch(() => undefined)
    }).catch(() => undefined)
    return () => {
      cancelled = true
      stop()
    }
  }, [applyRequests, chat, profile, refresh])

  const requestContact = useCallback(
    async (userId: string) => {
      await chat.requestContact(userId)
      await loadRequests()
    },
    [chat, loadRequests],
  )

  const acceptRequest = useCallback(
    async (requestId: string) => {
      const id = await chat.acceptRequest(requestId)
      await loadRequests()
      await refresh()
      return id
    },
    [chat, loadRequests, refresh],
  )

  const declineRequest = useCallback(
    async (requestId: string) => {
      await chat.declineRequest(requestId)
      await loadRequests()
    },
    [chat, loadRequests],
  )

  const cancelRequest = useCallback(
    async (requestId: string) => {
      await chat.cancelRequest(requestId)
      await loadRequests()
    },
    [chat, loadRequests],
  )

  const search = useCallback((query: string) => chat.searchUsers(query), [chat])
  const startChat = useCallback((userId: string) => chat.startConversation(userId), [chat])

  const send = useCallback(
    async (conversationId: string, body: string, reply?: ReplyTarget | null) => {
      const message = await chat.sendMessage(conversationId, body, reply)
      await ingest(message)
    },
    [chat, ingest],
  )

  const sendMedia = useCallback(
    async (input: OutgoingMedia) => {
      const message = await chat.sendMedia(input)
      await ingest(message)
    },
    [chat, ingest],
  )

  const hideMessage = useCallback(
    async (messageId: string) => {
      await chat.hideMessage(messageId)
      setMessages((prev) => prev.filter((item) => item.id !== messageId))
      await refresh()
    },
    [chat, refresh],
  )

  const editMessage = useCallback(
    async (messageId: string, body: string) => {
      await chat.editMessage(messageId, body)
      const text = body.trim()
      setMessages((prev) =>
        prev.map((item) => (item.id === messageId ? { ...item, body: text, editedAt: new Date().toISOString() } : item)),
      )
      await refresh()
    },
    [chat, refresh],
  )

  const blockUser = useCallback(
    async (userId: string) => {
      await chat.blockUser(userId)
      setConversations((prev) =>
        prev.map((item) => (item.kind !== 'group' && item.peer.id === userId ? { ...item, blocked: true, blockedByMe: true } : item)),
      )
      await refresh()
    },
    [chat, refresh],
  )

  const unblockUser = useCallback(
    async (userId: string) => {
      await chat.unblockUser(userId)
      setConversations((prev) =>
        prev.map((item) => (item.kind !== 'group' && item.peer.id === userId ? { ...item, blocked: false, blockedByMe: false } : item)),
      )
      await refresh()
    },
    [chat, refresh],
  )

  const setChatPref = useCallback(
    async (conversationId: string, patch: ChatPrefPatch) => {
      await chat.setChatPref(conversationId, patch)
      setConversations((prev) => prev.map((item) => (item.id === conversationId ? { ...item, ...patch } : item)))
    },
    [chat],
  )

  const createGroup = useCallback(
    async (title: string, memberIds: string[]) => {
      const id = await chat.createGroup(title, memberIds)
      await refresh()
      return id
    },
    [chat, refresh],
  )

  const afterGroupChange = useCallback(
    async (task: Promise<void>) => {
      await task
      await refresh()
    },
    [refresh],
  )

  const deleteForEveryone = useCallback(
    async (message: Message) => {
      await chat.deleteForEveryone(message)
      applyUpdate({
        ...message,
        deletedAt: new Date().toISOString(),
        body: '',
        mediaPath: null,
        mediaUrl: null,
        waveform: null,
      })
      await refresh()
    },
    [applyUpdate, chat, refresh],
  )

  const broadcastTyping = useCallback(
    (conversationId: string) => {
      void chat.broadcastTyping(conversationId).catch(() => undefined)
    },
    [chat],
  )

  const applyReaction = useCallback((change: ReactionChange) => {
    setMessages((prev) =>
      prev.map((message) => {
        if (message.id !== change.messageId) return message
        const reactions = (message.reactions ?? []).filter((item) => item.userId !== change.userId)
        if (!change.removed) reactions.push({ userId: change.userId, emoji: change.emoji })
        return { ...message, reactions }
      }),
    )
  }, [])

  const react = useCallback(
    async (messageId: string, emoji: string) => {
      const change = await chat.toggleReaction(messageId, emoji)
      applyReaction(change)
    },
    [applyReaction, chat],
  )

  useEffect(() => chat.subscribeReactions(applyReaction), [applyReaction, chat])

  const subscribeTyping = useCallback(
    (conversationId: string, onTyping: (userId: string) => void) => chat.subscribeTyping(conversationId, onTyping),
    [chat],
  )

  const value: ChatValue = {
    conversations,
    messages,
    loading,
    messagesLoading,
    error,
    activeId,
    toasts,
    dismissToast,
    pushToast,
    setActive,
    refresh,
    search,
    requests,
    incomingRequests: requests.filter((request) => request.status === 'pending' && request.toId === profile?.id).length,
    requestContact,
    acceptRequest,
    declineRequest,
    cancelRequest,
    startChat,
    send,
    sendMedia,
    hideMessage,
    deleteForEveryone,
    editMessage,
    blockUser,
    unblockUser,
    listBlocked: chat.listBlocked,
    reportUser: chat.reportUser,
    listReports: chat.listReports,
    setChatPref,
    createGroup,
    listMembers: chat.listMembers,
    addMember: (conversationId, userId) => afterGroupChange(chat.addMember(conversationId, userId)),
    removeMember: (conversationId, userId) => afterGroupChange(chat.removeMember(conversationId, userId)),
    setMemberRole: (conversationId, userId, role) => afterGroupChange(chat.setMemberRole(conversationId, userId, role)),
    renameGroup: (conversationId, title) => afterGroupChange(chat.renameGroup(conversationId, title)),
    setGroupPhoto: (conversationId, file) => afterGroupChange(chat.setGroupPhoto(conversationId, file)),
    leaveGroup: (conversationId) => afterGroupChange(chat.leaveGroup(conversationId)),
    deleteGroup: (conversationId) => afterGroupChange(chat.deleteGroup(conversationId)),
    broadcastTyping,
    subscribeTyping,
    react,
  }

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChat(): ChatValue {
  const value = useContext(ChatContext)
  if (!value) throw new Error('useChat must be used inside ChatProvider')
  return value
}
