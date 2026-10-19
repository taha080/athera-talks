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
import type { Conversation, Message, OutgoingMedia, Profile, ReplyTarget } from '../types'
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
  search: (query: string) => Promise<Profile[]>
  startChat: (userId: string) => Promise<string>
  send: (conversationId: string, body: string, reply?: ReplyTarget | null) => Promise<void>
  sendMedia: (input: OutgoingMedia) => Promise<void>
  hideMessage: (messageId: string) => Promise<void>
  deleteForEveryone: (message: Message) => Promise<void>
  broadcastTyping: (conversationId: string) => void
  subscribeTyping: (conversationId: string, onTyping: (userId: string) => void) => () => void
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
    setMessages((prev) => prev.map((item) => (item.id === message.id ? { ...item, ...message, mediaUrl: message.mediaUrl ?? item.mediaUrl } : item)))
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
        const prefs = profileRef.current
        const peer = conversationsRef.current.find((item) => item.id === ready.conversationId)?.peer.username
        const preview = messagePreview(ready)
        if (prefs?.notifySound !== false) playMessageTone()
        if (prefs?.notifyDesktop !== false) void desktopNotice(peer ? `@${peer}` : 'Athera Talks', preview)
        pushToast(peer ? `New message from @${peer}` : 'New message')
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
    })
  }, [applyUpdate, chat, ingest])

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
    startChat,
    send,
    sendMedia,
    hideMessage,
    deleteForEveryone,
    broadcastTyping,
    subscribeTyping,
  }

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChat(): ChatValue {
  const value = useContext(ChatContext)
  if (!value) throw new Error('useChat must be used inside ChatProvider')
  return value
}
