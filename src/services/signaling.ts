import { isCallSignal } from '../lib/signal'
import { getSupabase } from '../lib/supabase'
import type { CallSignal } from '../types'

// Call signals are rows. The database rejects a ring, offer, or ICE candidate
// unless the two people are accepted contacts in that chat.
export function subscribeSignals(userId: string, onSignal: (signal: CallSignal) => void): () => void {
  const supabase = getSupabase()
  if (!supabase) return () => {}
  const channel = supabase
    .channel(`call-signals:${userId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'call_signals', filter: `to_id=eq.${userId}` }, (payload) => {
      const row = payload.new as { payload?: unknown }
      if (isCallSignal(row.payload)) onSignal(row.payload)
    })
    .subscribe()
  return () => {
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
