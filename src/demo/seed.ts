import type { Message, Profile } from '../types'

export const TAHA_ID = 'a1000000-0000-4000-8000-000000000001'
export const SAKURA_ID = 'a1000000-0000-4000-8000-000000000002'
export const KENJI_ID = 'a1000000-0000-4000-8000-000000000003'
export const MIRA_ID = 'a1000000-0000-4000-8000-000000000004'
export const REN_ID = 'a1000000-0000-4000-8000-000000000005'

export const SAKURA_CHAT = 'c1000000-0000-4000-8000-000000000001'
export const KENJI_CHAT = 'c1000000-0000-4000-8000-000000000002'
export const MIRA_CHAT = 'c1000000-0000-4000-8000-000000000003'
export const REN_CHAT = 'c1000000-0000-4000-8000-000000000004'

export const DEMO_EMAIL = 'taha@tatalk.app'
export const DEMO_PASSWORD = 'tatalk1'

export type DemoAccount = {
  email: string
  password: string
  profileId: string
}

export type DemoConversation = {
  id: string
  memberIds: [string, string]
  updatedAt: string
}

export type DemoHide = {
  messageId: string
  userId: string
}

export type DemoData = {
  version: 1
  currentUserId: string | null
  profiles: Profile[]
  accounts: DemoAccount[]
  conversations: DemoConversation[]
  messages: Message[]
  hides: DemoHide[]
}

const hour = 60 * 60 * 1000
const day = 24 * hour

export function buildSeed(now = Date.now()): DemoData {
  const at = (msAgo: number) => new Date(now - msAgo).toISOString()

  const profiles: Profile[] = [
    { id: TAHA_ID, username: 'taha', avatarUrl: null, favouriteAnime: 'Attack on Titan', theme: 'dark', wallpaper: 'waves', lastSeenAt: at(15_000), showLastSeen: true, showReadReceipts: true, notifySound: true, notifyDesktop: true },
    { id: SAKURA_ID, username: 'sakura', avatarUrl: null, favouriteAnime: 'Demon Slayer', lastSeenAt: at(20_000), showReadReceipts: true },
    { id: KENJI_ID, username: 'kenji', avatarUrl: null, favouriteAnime: 'One Piece', lastSeenAt: at(2 * hour), showReadReceipts: true },
    { id: MIRA_ID, username: 'mira', avatarUrl: null, favouriteAnime: 'Spy x Family', lastSeenAt: at(5 * hour), showReadReceipts: false },
    { id: REN_ID, username: 'ren', avatarUrl: null, favouriteAnime: 'Frieren', lastSeenAt: at(10 * 60_000), showReadReceipts: true },
  ]

  const messages: Message[] = [
    msg('m1', SAKURA_CHAT, SAKURA_ID, 'The new episode dropped and I am not ready.', at(day + 2 * hour), at(day)),
    msg('m2', SAKURA_CHAT, TAHA_ID, 'Pause it. I am making tea first.', at(day + hour), at(day)),
    msg('m3', SAKURA_CHAT, SAKURA_ID, 'Too late. The flame pillar scene broke me.', at(2 * hour), at(90 * 60 * 1000)),
    msg('m4', SAKURA_CHAT, TAHA_ID, 'I rewound it. That animation is unfair.', at(90 * 60 * 1000), at(80 * 60 * 1000)),
    msg('m5', SAKURA_CHAT, SAKURA_ID, 'Call later? I want to scream about the ending.', at(4 * 60 * 1000), null),
    msg('m6', KENJI_CHAT, KENJI_ID, 'One Piece thoughts when you have a minute.', at(day + 5 * hour), at(day + 4 * hour)),
    msg('m7', KENJI_CHAT, TAHA_ID, 'Gear 5 still feels like a cartoon in the best way.', at(day + 4 * hour), at(day + 3 * hour)),
    msg('m8', KENJI_CHAT, KENJI_ID, 'Oda is unhinged and I love it.', at(day + 3 * hour), at(day + 3 * hour)),
    msg('m9', MIRA_CHAT, MIRA_ID, 'Spy x Family movie night this weekend?', at(3 * day), at(3 * day - 10 * 60 * 1000)),
    msg('m10', MIRA_CHAT, TAHA_ID, 'Anya would approve.', at(3 * day - 20 * 60 * 1000), at(3 * day - 30 * 60 * 1000)),
    msg('m11', REN_CHAT, REN_ID, 'Frieren had no business being that quiet and that good.', at(30 * 60 * 1000), null),
  ]

  return {
    version: 1,
    currentUserId: null,
    profiles,
    accounts: [{ email: DEMO_EMAIL, password: DEMO_PASSWORD, profileId: TAHA_ID }],
    conversations: [
      { id: SAKURA_CHAT, memberIds: [TAHA_ID, SAKURA_ID], updatedAt: at(4 * 60 * 1000) },
      { id: KENJI_CHAT, memberIds: [TAHA_ID, KENJI_ID], updatedAt: at(day + 3 * hour) },
      { id: MIRA_CHAT, memberIds: [TAHA_ID, MIRA_ID], updatedAt: at(3 * day - 20 * 60 * 1000) },
      { id: REN_CHAT, memberIds: [TAHA_ID, REN_ID], updatedAt: at(30 * 60 * 1000) },
    ],
    messages,
    hides: [],
  }
}

function msg(
  id: string,
  conversationId: string,
  senderId: string,
  body: string,
  createdAt: string,
  readAt: string | null,
): Message {
  return { id, conversationId, senderId, body, createdAt, readAt }
}
