import { isCallSignal, signalChannelIsHealthy, signalSubscribeFailed } from '../lib/signal'
import { getSupabase } from '../lib/supabase'
import type { CallSignal } from '../types'
import type { RealtimeChannel } from '@supabase/supabase-js'

const RESUBSCRIBE_MS = 1_000

// Call signals are rows. The database rejects a ring, offer, or ICE candidate
// unless the two people are accepted contacts in that chat.
export function subscribeSignals(userId: string, onSignal: (signal: CallSignal) => void): () => void {
  const supabase = getSupabase()
  if (!supabase) return () => {}

  let stopped = false
  let generation = 0
  let reconnecting = false
  let timer: number | null = null

  function open(token: number): RealtimeChannel {
    return supabase!
      .channel(`call-signals:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'call_signals', filter: `to_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as { payload?: unknown }
          if (isCallSignal(row.payload)) onSignal(row.payload)
        },
      )
      .subscribe((status) => {
        if (stopped || token !== generation) return
        if (signalSubscribeFailed(status)) queueReconnect()
      })
  }

  function queueReconnect() {
    if (stopped || timer !== null || reconnecting) return
    timer = window.setTimeout(() => {
      timer = null
      if (stopped || reconnecting || signalChannelIsHealthy(channel.state)) return
      const old = channel
      const token = ++generation
      reconnecting = true
      void supabase!.removeChannel(old).finally(() => {
        if (stopped || token !== generation) {
          reconnecting = false
          return
        }
        channel = open(token)
        reconnecting = false
      })
    }, RESUBSCRIBE_MS)
  }

  let channel = open(++generation)

  function onVisible() {
    // Coming back to the app must not end the call. Rejoin signalling if the
    // socket was dropped while the page was hidden.
    if (document.visibilityState !== 'visible' || stopped) return
    supabase!.realtime.connect()
    if (!signalChannelIsHealthy(channel.state)) queueReconnect()
  }

  document.addEventListener('visibilitychange', onVisible)
  return () => {
    stopped = true
    generation += 1
    if (timer !== null) window.clearTimeout(timer)
    document.removeEventListener('visibilitychange', onVisible)
    void supabase.removeChannel(channel)
  }
}

export async function sendSignal(toUserId: string, signal: CallSignal): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return
  const { error } = await supabase.from('call_signals').insert({
    from_id: signal.from.id,
    to_id: toUserId,
    conversation_id: signal.conversationId,
    kind: signal.kind,
    payload: signal,
  })
  if (error) throw new Error(error.message)
}

export async function closeOutbox(userId?: string): Promise<void> {
  void userId
}
