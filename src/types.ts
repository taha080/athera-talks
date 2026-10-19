export type Profile = {
  id: string
  username: string
  avatarUrl: string | null
  favouriteAnime: string | null
}

export type Message = {
  id: string
  conversationId: string
  senderId: string
  body: string
  createdAt: string
  readAt: string | null
}

export type Conversation = {
  id: string
  updatedAt: string
  peer: Profile
  lastMessage: {
    body: string
    createdAt: string
    senderId: string
  } | null
  unread: number
}

export type SignalKind = 'ring' | 'offer' | 'answer' | 'ice' | 'reject' | 'hangup'

// Sent through a Supabase Realtime broadcast channel named inbox:<user id>.
export type CallSignal = {
  kind: SignalKind
  conversationId: string
  from: Profile
  sdp?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidateInit
}

export type MessageListener = {
  onInsert: (message: Message) => void
  onUpdate: (message: Message) => void
}
