import type { Message, Reaction } from '../types'

export type GroupPos = 'single' | 'start' | 'mid' | 'end'

export function sameMinute(a: Pick<Message, 'senderId' | 'createdAt' | 'deletedAt'>, b: Pick<Message, 'senderId' | 'createdAt' | 'deletedAt'>): boolean {
  if (a.senderId !== b.senderId || a.deletedAt || b.deletedAt) return false
  const left = new Date(a.createdAt)
  const right = new Date(b.createdAt)
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate() &&
    left.getHours() === right.getHours() &&
    left.getMinutes() === right.getMinutes()
  )
}

export function groupPosition(messages: Message[], index: number): GroupPos {
  const current = messages[index]
  const prev = messages[index - 1]
  const next = messages[index + 1]
  const withPrev = Boolean(prev && sameMinute(prev, current))
  const withNext = Boolean(next && sameMinute(current, next))
  if (withPrev && withNext) return 'mid'
  if (withPrev) return 'end'
  if (withNext) return 'start'
  return 'single'
}

export type TextPart = { type: 'text' | 'link'; value: string }

const URL_RE = /https?:\/\/[^\s<>"']+/gi

export function linkParts(body: string): TextPart[] {
  const parts: TextPart[] = []
  let last = 0
  for (const match of body.matchAll(URL_RE)) {
    const index = match.index ?? 0
    const raw = match[0]
    const value = raw.replace(/[.,!?;:)]+$/, '')
    if (index > last) parts.push({ type: 'text', value: body.slice(last, index) })
    parts.push({ type: 'link', value })
    const trailing = raw.slice(value.length)
    if (trailing) parts.push({ type: 'text', value: trailing })
    last = index + raw.length
  }
  if (last < body.length) parts.push({ type: 'text', value: body.slice(last) })
  if (parts.length === 0) parts.push({ type: 'text', value: body })
  const merged: TextPart[] = []
  for (const part of parts) {
    const previous = merged.at(-1)
    if (part.type === 'text' && previous?.type === 'text') previous.value += part.value
    else merged.push({ ...part })
  }
  return merged
}

export function linkHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function groupedReactions(reactions: Reaction[] | undefined, meId: string): { emoji: string; count: number; mine: boolean }[] {
  const map = new Map<string, { emoji: string; count: number; mine: boolean }>()
  for (const reaction of reactions ?? []) {
    const row = map.get(reaction.emoji) ?? { emoji: reaction.emoji, count: 0, mine: false }
    row.count += 1
    if (reaction.userId === meId) row.mine = true
    map.set(reaction.emoji, row)
  }
  return [...map.values()]
}

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏']
