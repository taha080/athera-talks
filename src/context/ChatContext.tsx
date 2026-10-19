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
import type { Conversation, Message, Profile } from '../types'
import { useSession } from './SessionContext'

type ChatValue = {
  conversations: Conversation[]
  messages: Message[]
  loading: boolean
  messagesLoading: boolean
  error: string | null
  activeId: string | null
  setActive: (id: string | null) => void
  refresh: () => Promise<void>
  search: (query: string) => Promise<Profile[]>
  startChat: (userId: string) => Promise<string>
  send: (conversationId: string, body: string) => Promise<void>
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
  const activeRef = useRef<string | null>(null)
  const seen = useRef(new Set<string>())
  const me = profile?.id ?? ''

  const refresh = useCallback(async () => {
    const rows = await chat.listConversations()
    setConversations(rows)
  }, [chat])

  const ingest = useCallback(
    (message: Message) => {
      if (seen.current.has(message.id)) {
        setMessages((prev) => prev.map((item) => (item.id === message.id ? message : item)))
        return
      }
      seen.current.add(message.id)
      setMessages((prev) =>
        activeRef.current === message.conversationId ? appendMessage(prev, message) : prev,
      )
      setConversations((prev) => {
        const next = foldConversation(prev, message, me, activeRef.current)
        if (!next) {
          void refresh()
          return prev
        }
        return next
      })
      if (activeRef.current === message.conversationId && message.senderId !== me) {
        void chat.markRead(message.conversationId).then(() => {
          setConversations((prev) =>
            prev.map((item) => (item.id === message.conversationId ? { ...item, unread: 0 } : item)),
          )
        })
      }
    },
    [chat, me, refresh],
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
      onInsert: (message) => ingest(message),
      onUpdate: (message) => {
        setMessages((prev) => prev.map((item) => (item.id === message.id ? message : item)))
      },
    })
  }, [chat, ingest])

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
    async (conversationId: string, body: string) => {
      const message = await chat.sendMessage(conversationId, body)
      ingest(message)
    },
    [chat, ingest],
  )

  const value: ChatValue = {
    conversations,
    messages,
    loading,
    messagesLoading,
    error,
    activeId,
    setActive,
    refresh,
    search,
    startChat,
    send,
  }

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChat(): ChatValue {
  const value = useContext(ChatContext)
  if (!value) throw new Error('useChat must be used inside ChatProvider')
  return value
}
