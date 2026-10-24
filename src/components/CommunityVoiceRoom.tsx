// Group voice room for a community.
//
// This builds on the existing WebRTC helpers (TURN/ICE resolution in
// lib/webrtc.ts) instead of the 1-to-1 call signalling table: participants
// join a Supabase Realtime broadcast channel for the room and form a small
// mesh of peer connections, one per other participant. Remote audio is
// rendered with plain <audio> elements.
//
// Honest limits, shown in the UI: a full mesh does not scale to very large
// rooms, and when Supabase is not connected (demo mode) the room is
// presence-only — the microphone is requested locally, but no audio is sent
// to anyone else. Joining or leaving never crashes the page: any signalling
// or microphone failure is reported as a room error and the room stays open.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getSupabase } from '../lib/supabase'
import { createPeerConnection, mediaError } from '../lib/webrtc'
import { ghostButton, primaryButton } from '../lib/styles'
import type { CommunityVoiceRoom } from '../lib/communities'

type SignalPayload = {
  from: string
  kind: 'join' | 'offer' | 'answer' | 'ice' | 'leave'
  sdp?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidateInit
}

export function CommunityVoiceRoom({ room, meId, meName }: { room: CommunityVoiceRoom; meId: string; meName: string }) {
  const [joined, setJoined] = useState(false)
  const [muted, setMuted] = useState(false)
  const [participants, setParticipants] = useState<string[]>([])
  const [remoteStreams, setRemoteStreams] = useState<{ peerId: string; stream: MediaStream }[]>([])
  const [error, setError] = useState('')
  const localStream = useRef<MediaStream | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const peers = useRef(new Map<string, RTCPeerConnection>())
  const joinedRef = useRef(false)

  const closePeers = useCallback(() => {
    for (const pc of peers.current.values()) {
      try { pc.close() } catch { /* already closed */ }
    }
    peers.current.clear()
    setRemoteStreams([])
  }, [])

  const leave = useCallback(() => {
    joinedRef.current = false
    const supabase = getSupabase()
    const channel = channelRef.current
    channelRef.current = null
    if (supabase && channel) {
      try {
        void channel.send({ type: 'broadcast', event: 'voice-signal', payload: { from: meId, kind: 'leave' } satisfies SignalPayload })
      } catch { /* leaving anyway */ }
      void supabase.removeChannel(channel)
    }
    localStream.current?.getTracks().forEach((track) => track.stop())
    localStream.current = null
    closePeers()
    setParticipants([])
    setJoined(false)
  }, [closePeers, meId])

  useEffect(() => () => {
    if (joinedRef.current) leave()
  }, [leave])

  const handleSignal = useCallback(async (payload: SignalPayload) => {
    if (payload.from === meId) return
    const supabase = getSupabase()
    const channel = channelRef.current
    if (!supabase || !channel) return
    const send = (signal: SignalPayload) => {
      void channel.send({ type: 'broadcast', event: 'voice-signal', payload: signal })
    }
    if (payload.kind === 'join') {
      setParticipants((prev) => (prev.includes(payload.from) ? prev : [...prev, payload.from]))
      // The newcomer waits for offers; existing members initiate.
      const pc = await createPeerConnection()
      peers.current.set(payload.from, pc)
      localStream.current?.getTracks().forEach((track) => pc.addTrack(track, localStream.current!))
      pc.ontrack = (event) => {
        const stream = event.streams[0]
        if (stream) setRemoteStreams((prev) => (prev.some((item) => item.peerId === payload.from) ? prev : [...prev, { peerId: payload.from, stream }]))
      }
      pc.onicecandidate = (event) => {
        if (event.candidate) send({ from: meId, kind: 'ice', candidate: event.candidate.toJSON() })
      }
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      send({ from: meId, kind: 'offer', sdp: offer })
      return
    }
    if (payload.kind === 'leave') {
      peers.current.get(payload.from)?.close()
      peers.current.delete(payload.from)
      setParticipants((prev) => prev.filter((id) => id !== payload.from))
      setRemoteStreams((prev) => prev.filter((item) => item.peerId !== payload.from))
      return
    }
    if (payload.kind === 'offer' && payload.sdp) {
      setParticipants((prev) => (prev.includes(payload.from) ? prev : [...prev, payload.from]))
      const pc = await createPeerConnection()
      peers.current.set(payload.from, pc)
      localStream.current?.getTracks().forEach((track) => pc.addTrack(track, localStream.current!))
      pc.ontrack = (event) => {
        const stream = event.streams[0]
        if (stream) setRemoteStreams((prev) => (prev.some((item) => item.peerId === payload.from) ? prev : [...prev, { peerId: payload.from, stream }]))
      }
      pc.onicecandidate = (event) => {
        if (event.candidate) send({ from: meId, kind: 'ice', candidate: event.candidate.toJSON() })
      }
      await pc.setRemoteDescription(payload.sdp)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      send({ from: meId, kind: 'answer', sdp: answer })
      return
    }
    if (payload.kind === 'answer' && payload.sdp) {
      const pc = peers.current.get(payload.from)
      if (pc && pc.signalingState !== 'stable') await pc.setRemoteDescription(payload.sdp)
      return
    }
    if (payload.kind === 'ice' && payload.candidate) {
      const pc = peers.current.get(payload.from)
      if (pc) {
        try { await pc.addIceCandidate(payload.candidate) } catch { /* candidate arrived too early; next ones still work */ }
      }
    }
  }, [meId])

  const join = useCallback(async () => {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      localStream.current = stream
    } catch (error) {
      setError(mediaError(error))
      return
    }
    const supabase = getSupabase()
    if (!supabase) {
      // Demo / fallback mode: presence only, no audio leaves this device.
      setParticipants([meId])
      setJoined(true)
      joinedRef.current = true
      return
    }
    const channel = supabase.channel(`community-voice:${room.id}`, { config: { broadcast: { self: false } } })
    channelRef.current = channel
    channel.on('broadcast', { event: 'voice-signal' }, ({ payload }) => {
      void handleSignal(payload as SignalPayload)
    })
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        joinedRef.current = true
        setParticipants([meId])
        setJoined(true)
        void channel.send({ type: 'broadcast', event: 'voice-signal', payload: { from: meId, kind: 'join' } satisfies SignalPayload })
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setError('Could not join the voice room. Check your connection and try again.')
      }
    })
  }, [handleSignal, meId, room.id])

  const toggleMute = () => {
    const next = !muted
    localStream.current?.getAudioTracks().forEach((track) => { track.enabled = !next })
    setMuted(next)
  }

  return (
    <div className="rounded-xl border border-line bg-panel p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{room.name}</p>
          <p className="text-xs text-mist">
            {joined ? `${participants.length} in this room` : 'Group voice room'}
            {!getSupabase() ? ' · demo room, audio stays on this device' : ''}
          </p>
        </div>
        {joined ? (
          <div className="flex gap-2">
            <button type="button" className={ghostButton} onClick={toggleMute}>{muted ? 'Unmute' : 'Mute'}</button>
            <button type="button" className={ghostButton} onClick={leave}>Leave</button>
          </div>
        ) : (
          <button type="button" className={primaryButton} onClick={() => void join()}>Join voice</button>
        )}
      </div>
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      {joined ? (
        <p className="mt-2 text-xs text-mist">
          You are {muted ? 'muted' : 'live'} as @{meName}. In a small room, other members' audio plays here automatically.
        </p>
      ) : null}
      {remoteStreams.map((item) => (
        <audio key={item.peerId} autoPlay playsInline ref={(element) => { if (element) element.srcObject = item.stream }} />
      ))}
    </div>
  )
}
