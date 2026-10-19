import type { CallSignal } from '../types'

const KINDS = new Set(['ring', 'offer', 'answer', 'ice', 'reject', 'hangup'])
const FAILED_CHANNEL = new Set(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'])
const HEALTHY_CHANNEL = new Set(['joined', 'joining'])

export function signalSubscribeFailed(status: string): boolean {
  return FAILED_CHANNEL.has(status)
}

export function signalChannelIsHealthy(state: string | undefined): boolean {
  return Boolean(state && HEALTHY_CHANNEL.has(state))
}

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
