export type MessageKind = 'text' | 'voice' | 'image'

export type Profile = {
  id: string
  username: string
  avatarUrl: string | null
  favouriteAnime: string | null
  theme?: string
  wallpaper?: string
  wallpaperPath?: string | null
  wallpaperUrl?: string | null
  lastSeenAt?: string | null
  showLastSeen?: boolean
  showReadReceipts?: boolean
  notifySound?: boolean
  notifyDesktop?: boolean
}

export type ReplyTarget = {
  id: string
  preview: string
}

export type OutgoingMedia = {
  conversationId: string
  kind: 'voice' | 'image'
  file: Blob
  mime: string
  seconds?: number
  waveform?: number[]
  reply?: ReplyTarget | null
}

export type Message = {
  id: string
  conversationId: string
  senderId: string
  body: string
  createdAt: string
  readAt: string | null
  kind?: MessageKind
  deliveredAt?: string | null
  mediaPath?: string | null
  mediaUrl?: string | null
  mediaMime?: string | null
  mediaSeconds?: number | null
  waveform?: number[] | null
  replyTo?: string | null
  replyPreview?: string | null
  deletedAt?: string | null
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
