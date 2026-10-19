import type { CallSignal } from '../types'

const KINDS = new Set(['ring', 'offer', 'answer', 'ice', 'reject', 'hangup'])

export function isCallSignal(value: unknown): value is CallSignal {
  if (!value || typeof value !== 'object') return false
  const signal = value as Partial<CallSignal>
  if (!signal.kind || !KINDS.has(signal.kind)) return false
  if (typeof signal.conversationId !== 'string' || !signal.conversationId) return false
  if (!signal.from || typeof signal.from.id !== 'string' || typeof signal.from.username !== 'string') {
    return false
  }
  return true
}
