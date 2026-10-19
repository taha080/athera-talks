import type { RealtimeChannel } from '@supabase/supabase-js'
import { isCallSignal } from '../lib/signal'
import { getSupabase } from '../lib/supabase'
import type { CallSignal } from '../types'

// One shared inbox per user. Both people must have Athera Talks open; signals are not stored.
const outbox = new Map<string, { channel: RealtimeChannel; ready: Promise<void> }>()

export function subscribeSignals(userId: string, onSignal: (signal: CallSignal) => void): () => void {
  const supabase = getSupabase()
  if (!supabase) return () => {}
  const channel = supabase.channel(`inbox:${userId}`, {
    config: { broadcast: { self: false } },
  })
  channel.on('broadcast', { event: 'signal' }, ({ payload }) => {
    if (isCallSignal(payload)) onSignal(payload)
  })
  channel.subscribe()
  return () => {
    void supabase.removeChannel(channel)
  }
}

export async function sendSignal(toUserId: string, signal: CallSignal): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return
  let entry = outbox.get(toUserId)
  if (!entry) {
    const channel = supabase.channel(`inbox:${toUserId}`, {
      config: { broadcast: { self: false } },
    })
    const ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Call signaling timed out.')), 8000)
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timer)
          resolve()
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timer)
          reject(new Error('Could not open the call channel.'))
        }
      })
    })
    entry = { channel, ready }
    outbox.set(toUserId, entry)
  }
  await entry.ready
  const result = await entry.channel.send({
    type: 'broadcast',
    event: 'signal',
    payload: signal,
  })
  if (result !== 'ok') throw new Error('Could not send the call signal.')
}

export async function closeOutbox(userId?: string): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return
  const ids = userId ? [userId] : [...outbox.keys()]
  await Promise.all(
    ids.map(async (id) => {
      const entry = outbox.get(id)
      if (!entry) return
      outbox.delete(id)
      await supabase.removeChannel(entry.channel)
    }),
  )
}
