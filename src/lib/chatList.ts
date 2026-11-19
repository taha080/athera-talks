import type { Conversation } from '../types'

export const PIN_LIMIT = 3

export const REPORT_REASONS = ['Spam', 'Harassment', 'Impersonation', 'Other'] as const

export type ReportReason = (typeof REPORT_REASONS)[number]

export function isGroup(conversation: Pick<Conversation, 'kind'>): boolean {
  return conversation.kind === 'group'
}

export function chatTitle(conversation: Pick<Conversation, 'kind' | 'title' | 'peer'>): string {
  if (isGroup(conversation)) return conversation.title?.trim() || 'Group'
  return conversation.peer.username
}

/** Above-bubble names belong on other people's messages in a group. */
export function showSenderName(mine: boolean, group: boolean): boolean {
  return !mine && group
}

export function byChatOrder(a: Conversation, b: Conversation): number {
  if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1
  if (a.updatedAt === b.updatedAt) return 0
  return a.updatedAt < b.updatedAt ? 1 : -1
}

export function inboxChats(list: Conversation[]): Conversation[] {
  return list.filter((item) => !item.archived).sort(byChatOrder)
}

export function archivedChats(list: Conversation[]): Conversation[] {
  return list.filter((item) => item.archived).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}

/** Total unread across every conversation — the number the launcher icon badge mirrors. */
export function totalUnread(list: Conversation[]): number {
  return list.reduce((sum, item) => sum + (item.unread || 0), 0)
}

/**
 * The chat the user is looking at is being read right now, so it never
 * carries an unread count — whatever a refresh re-fetched from the server.
 * Without this, a heartbeat refresh can restore a stale server unread
 * count for the open chat, and its badge sticks at 1 even though the user
 * is staring at the messages.
 */
export function withOpenChatRead(list: Conversation[], activeId: string | null): Conversation[] {
  if (!activeId) return list
  return list.map((item) => (item.id === activeId ? { ...item, unread: 0 } : item))
}
