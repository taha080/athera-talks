import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { ChatThread, Welcome } from '../components/ChatThread'
import { useChat } from '../context/ChatContext'

export function HomePage() {
  const { conversationId } = useParams()
  const { conversations, setActive } = useChat()

  useEffect(() => {
    setActive(conversationId ?? null)
    return () => setActive(null)
  }, [conversationId, setActive])

  if (!conversationId) return <Welcome />
  const conversation = conversations.find((item) => item.id === conversationId)
  return <ChatThread conversation={conversation} />
}
