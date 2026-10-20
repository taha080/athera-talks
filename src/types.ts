export type MessageKind = 'text' | 'voice' | 'image'
export type CallType = 'voice' | 'video'
export type CallStatus = 'completed' | 'missed' | 'declined' | 'cancelled'

export type CallLog = {
  id: string
  conversationId: string
  callerId: string
  calleeId: string | null
  callType: CallType
  startedAt: string
  answeredAt: string | null
  endedAt: string
  status: CallStatus
  durationSeconds: number
  clientId?: string | null
}

export type ContactStatus = 'pending' | 'accepted' | 'declined'

export type SearchPerson = Profile & {
  requestId?: string | null
  requestStatus?: ContactStatus | null
  requestFromId?: string | null
}

export type ContactRequest = {
  id: string
  fromId: string
  toId: string
  status: ContactStatus
  createdAt: string
  updatedAt: string
  peer: Profile
}

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
  isCreator?: boolean
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

export type Reaction = {
  userId: string
  emoji: string
}

export type ReactionChange = {
  messageId: string
  userId: string
  emoji: string
  removed: boolean
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
  editedAt?: string | null
  reactions?: Reaction[]
}

export type ConversationKind = 'direct' | 'group'
export type MemberRole = 'admin' | 'member'

export type Conversation = {
  id: string
  updatedAt: string
  peer: Profile
  lastMessage: {
    body: string
    createdAt: string
    senderId: string
    readAt?: string | null
    deliveredAt?: string | null
  } | null
  unread: number
  kind?: ConversationKind
  title?: string | null
  photoUrl?: string | null
  memberCount?: number
  myRole?: MemberRole
  pinned?: boolean
  muted?: boolean
  archived?: boolean
  blocked?: boolean
  blockedByMe?: boolean
}

export type GroupMember = {
  id: string
  username: string
  avatarUrl: string | null
  favouriteAnime: string | null
  isCreator: boolean
  role: MemberRole
}

export type BlockedPerson = {
  id: string
  username: string
  avatarUrl: string | null
  isCreator: boolean
  blockedAt: string
}

export type UserReport = {
  id: string
  reporterId: string
  reporterUsername: string
  reportedId: string
  reportedUsername: string
  conversationId: string | null
  reason: string
  details: string | null
  createdAt: string
}

export type ChatPrefPatch = {
  pinned?: boolean
  muted?: boolean
  archived?: boolean
}

export type SignalKind = 'ring' | 'offer' | 'answer' | 'ice' | 'reject' | 'hangup'

// Stored as a call_signals row. The database rejects it unless the two people are accepted contacts.
export type CallSignal = {
  kind: SignalKind
  conversationId: string
  from: Profile
  sdp?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidateInit
  callId?: string
}

export type MessageReceipt = {
  messageId: string
  conversationId: string
  readAt: string | null
  deliveredAt: string | null
}

export type MessageListener = {
  onInsert: (message: Message) => void
  onUpdate: (message: Message) => void
  onReceipt?: (receipt: MessageReceipt) => void
}
