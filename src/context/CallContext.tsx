import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { callReducer, initialCallState } from '../lib/callMachine'
import { createPeerConnection, mediaError } from '../lib/webrtc'
import { closeOutbox, sendSignal, subscribeSignals } from '../services/signaling'
import type { CallSignal, Profile } from '../types'
import { useSession } from './SessionContext'

type CallValue = {
  phase: typeof initialCallState.phase
  peer: Profile | null
  muted: boolean
  startedAt: number | null
  error: string | null
  banner: string | null
  demo: boolean
  startCall: (peer: Profile, conversationId: string) => Promise<void>
  accept: () => Promise<void>
  reject: () => Promise<void>
  hangup: () => Promise<void>
  toggleMute: () => void
  simulateIncoming: (peer: Profile, conversationId: string) => void
  audioRef: RefObject<HTMLAudioElement | null>
}

const CallContext = createContext<CallValue | null>(null)

export function CallProvider({ children }: { children: ReactNode }) {
  const { mode, profile } = useSession()
  const [state, dispatch] = useReducer(callReducer, initialCallState)
  const [banner, setBanner] = useState<string | null>(null)
  const stateRef = useRef(state)
  const profileRef = useRef(profile)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const localRef = useRef<MediaStream | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([])
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null)
  const remoteReadyRef = useRef(false)
  const demoTimer = useRef<number | null>(null)
  stateRef.current = state
  profileRef.current = profile

  const cleanupMedia = useCallback(() => {
    if (demoTimer.current) window.clearTimeout(demoTimer.current)
    demoTimer.current = null
    localRef.current?.getTracks().forEach((track) => track.stop())
    localRef.current = null
    pcRef.current?.close()
    pcRef.current = null
    pendingIceRef.current = []
    pendingOfferRef.current = null
    remoteReadyRef.current = false
    if (audioRef.current) audioRef.current.srcObject = null
    const peerId = stateRef.current.peer?.id
    if (peerId && mode === 'live') void closeOutbox(peerId)
  }, [mode])

  const deliver = useCallback(
    async (to: Profile, signal: CallSignal) => {
      if (mode !== 'live') return
      await sendSignal(to.id, signal)
    },
    [mode],
  )

  const flushIce = useCallback(async () => {
    const pc = pcRef.current
    if (!pc) return
    remoteReadyRef.current = true
    const queued = pendingIceRef.current
    pendingIceRef.current = []
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(candidate)
      } catch {
        // A late candidate can arrive after the call ends.
      }
    }
  }, [])

  const attachPeer = useCallback(
    async (peer: Profile, conversationId: string, me: Profile) => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      localRef.current = stream
      const pc = createPeerConnection()
      pcRef.current = pc
      stream.getTracks().forEach((track) => pc.addTrack(track, stream))
      pc.onicecandidate = (event) => {
        if (!event.candidate) return
        void deliver(peer, {
          kind: 'ice',
          conversationId,
          from: me,
          candidate: event.candidate.toJSON(),
        })
      }
      pc.ontrack = (event) => {
        const audio = audioRef.current
        if (!audio) return
        audio.srcObject = event.streams[0]
        void audio.play().catch(() => {})
      }
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          dispatch({ type: 'connected', at: Date.now() })
        }
        if (pc.connectionState === 'failed') {
          dispatch({
            type: 'fail',
            error: 'Could not connect the voice call. A strict network may need a TURN relay, which v1 does not include.',
          })
        }
      }
    },
    [deliver],
  )

  const onSignal = useCallback(
    async (signal: CallSignal) => {
      const me = profileRef.current
      if (!me || signal.from.id === me.id) return
      const phase = stateRef.current.phase
      const currentId = stateRef.current.conversationId

      if (signal.kind === 'ring' || signal.kind === 'offer') {
        if (signal.sdp) pendingOfferRef.current = signal.sdp
        if (phase === 'idle') {
          dispatch({ type: 'incoming', conversationId: signal.conversationId, peer: signal.from })
          return
        }
        if (currentId === signal.conversationId) return
        if (signal.kind === 'ring') {
          await deliver(signal.from, { kind: 'reject', conversationId: signal.conversationId, from: me })
        }
        return
      }

      if (!currentId || signal.conversationId !== currentId) return

      if (signal.kind === 'answer' && signal.sdp && pcRef.current) {
        await pcRef.current.setRemoteDescription(signal.sdp)
        await flushIce()
        dispatch({ type: 'remote-joined' })
        return
      }

      if (signal.kind === 'ice' && signal.candidate) {
        if (!pcRef.current || !remoteReadyRef.current) {
          pendingIceRef.current.push(signal.candidate)
          return
        }
        try {
          await pcRef.current.addIceCandidate(signal.candidate)
        } catch {
          // Ignore candidates that arrive after close.
        }
        return
      }

      if (signal.kind === 'reject' || signal.kind === 'hangup') {
        cleanupMedia()
        dispatch({ type: 'hangup' })
        setBanner(signal.kind === 'reject' ? 'Call declined' : 'Call ended')
      }
    },
    [cleanupMedia, deliver, flushIce],
  )

  const onSignalRef = useRef(onSignal)
  onSignalRef.current = onSignal

  useEffect(() => {
    if (!profile || mode !== 'live') return
    return subscribeSignals(profile.id, (signal) => {
      void onSignalRef.current(signal)
    })
  }, [mode, profile])

  useEffect(() => {
    if (!banner) return
    const timer = window.setTimeout(() => setBanner(null), 2800)
    return () => window.clearTimeout(timer)
  }, [banner])

  const startCall = useCallback(
    async (peer: Profile, conversationId: string) => {
      const me = profileRef.current
      if (!me || stateRef.current.phase !== 'idle') return
      dispatch({ type: 'start', conversationId, peer })
      setBanner(null)
      if (mode === 'demo') {
        demoTimer.current = window.setTimeout(() => {
          dispatch({ type: 'connected', at: Date.now() })
        }, 1400)
        return
      }
      try {
        await attachPeer(peer, conversationId, me)
        const pc = pcRef.current
        if (!pc) return
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        await deliver(peer, { kind: 'ring', conversationId, from: me })
        await deliver(peer, { kind: 'offer', conversationId, from: me, sdp: offer })
      } catch (error) {
        dispatch({ type: 'fail', error: mediaError(error) })
      }
    },
    [attachPeer, deliver, mode],
  )

  const accept = useCallback(async () => {
    const snap = stateRef.current
    const me = profileRef.current
    if (!me || snap.phase !== 'incoming' || !snap.peer || !snap.conversationId) return
    dispatch({ type: 'accept' })
    if (mode === 'demo') {
      dispatch({ type: 'connected', at: Date.now() })
      return
    }
    try {
      await attachPeer(snap.peer, snap.conversationId, me)
      const started = Date.now()
      let offer = pendingOfferRef.current
      while (!offer && Date.now() - started < 4000) {
        await new Promise((resolve) => setTimeout(resolve, 120))
        offer = pendingOfferRef.current
      }
      if (!offer) throw new Error('Still waiting for the call offer. Ask them to call again.')
      const pc = pcRef.current
      if (!pc) return
      await pc.setRemoteDescription(offer)
      await flushIce()
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      await deliver(snap.peer, {
        kind: 'answer',
        conversationId: snap.conversationId,
        from: me,
        sdp: answer,
      })
    } catch (error) {
      dispatch({ type: 'fail', error: mediaError(error) })
    }
  }, [attachPeer, deliver, flushIce, mode])

  const finish = useCallback(
    async (kind: 'reject' | 'hangup') => {
      const snap = stateRef.current
      const me = profileRef.current
      if (me && snap.peer && snap.conversationId && mode === 'live' && snap.phase !== 'idle') {
        await deliver(snap.peer, { kind, conversationId: snap.conversationId, from: me }).catch(() => {})
      }
      cleanupMedia()
      dispatch({ type: 'hangup' })
    },
    [cleanupMedia, deliver, mode],
  )

  const reject = useCallback(() => finish('reject'), [finish])
  const hangup = useCallback(() => finish(stateRef.current.phase === 'incoming' ? 'reject' : 'hangup'), [finish])

  const toggleMute = useCallback(() => {
    const nextMuted = !stateRef.current.muted
    localRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted
    })
    dispatch({ type: 'toggle-mute' })
  }, [])

  const simulateIncoming = useCallback((peer: Profile, conversationId: string) => {
    if (stateRef.current.phase !== 'idle') return
    dispatch({ type: 'incoming', conversationId, peer })
  }, [])

  const value: CallValue = {
    phase: state.phase,
    peer: state.peer,
    muted: state.muted,
    startedAt: state.startedAt,
    error: state.error,
    banner,
    demo: mode === 'demo',
    startCall,
    accept,
    reject,
    hangup,
    toggleMute,
    simulateIncoming,
    audioRef,
  }

  return (
    <CallContext.Provider value={value}>
      {children}
      <audio ref={audioRef} autoPlay playsInline className="hidden" />
    </CallContext.Provider>
  )
}

export function useCall(): CallValue {
  const value = useContext(CallContext)
  if (!value) throw new Error('useCall must be used inside CallProvider')
  return value
}
