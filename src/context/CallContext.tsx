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
import {
  callReducer,
  CONNECT_TIMEOUT_MESSAGE,
  CONNECT_TIMEOUT_MS,
  initialCallState,
  RELAY_RETRY_MS,
} from '../lib/callMachine'
import { rememberCandidate, takeCandidates, type IceQueue } from '../lib/iceQueue'
import {
  candidateType,
  createPeerConnection,
  formatCallLink,
  formatCandidateTypes,
  hasLiveAudioSender,
  mediaError,
  pickRemoteStream,
  readIcePolicy,
  SILENT_WAV,
  waitForIceCandidate,
  type IcePolicy,
} from '../lib/webrtc'
import { profileIsCreator } from '../services/liveBackend'
import { closeOutbox, sendSignal, subscribeSignals } from '../services/signaling'
import type { CallSignal, Profile } from '../types'
import { useSession } from './SessionContext'

type CallValue = {
  phase: typeof initialCallState.phase
  peer: Profile | null
  muted: boolean
  connectedAt: number | null
  error: string | null
  banner: string | null
  demo: boolean
  debug: string
  relaying: boolean
  startCall: (peer: Profile, conversationId: string) => Promise<void>
  accept: () => Promise<void>
  reject: () => Promise<void>
  hangup: () => Promise<void>
  toggleMute: () => void
  speakerOn: boolean
  toggleSpeaker: () => void
  simulateIncoming: (peer: Profile, conversationId: string) => void
  audioRef: RefObject<HTMLAudioElement | null>
}

const CallContext = createContext<CallValue | null>(null)

export function CallProvider({ children }: { children: ReactNode }) {
  const { mode, profile } = useSession()
  const [state, dispatch] = useReducer(callReducer, initialCallState)
  const [banner, setBanner] = useState<string | null>(null)
  const [debug, setDebug] = useState('')
  const [relaying, setRelaying] = useState(false)
  const [speakerOn, setSpeakerOn] = useState(true)
  const speakerRef = useRef(true)
  const stateRef = useRef(state)
  const profileRef = useRef(profile)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const localRef = useRef<MediaStream | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const iceQueueRef = useRef<IceQueue>(new Map())
  const activeCallRef = useRef<string | null>(null)
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null)
  const remoteReadyRef = useRef(false)
  const roleRef = useRef<'caller' | 'callee' | null>(null)
  const policyRef = useRef<IcePolicy>('all')
  const relayTriedRef = useRef(false)
  const relayingRef = useRef(false)
  const candidatesRef = useRef<Set<string>>(new Set())
  const waitRef = useRef<number | null>(null)
  const demoTimer = useRef<number | null>(null)
  const restartRelayRef = useRef<() => Promise<void>>(async () => {})
  stateRef.current = state
  profileRef.current = profile

  const applyOutput = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    const on = speakerRef.current
    audio.muted = !on
    audio.volume = on ? 1 : 0
    audio.autoplay = true
    const pending = audio.play()
    if (pending) void pending.catch(() => {})
  }, [])

  const playRemote = useCallback(() => {
    applyOutput()
  }, [applyOutput])

  const noteRelay = useCallback(() => {
    relayingRef.current = true
    setRelaying(true)
  }, [])

  const publishLinkRef = useRef<() => Promise<void>>(async () => {})
  const noteCandidate = useCallback((candidate: string | null | undefined) => {
    const type = candidateType(candidate)
    if (!type || candidatesRef.current.has(type)) return
    candidatesRef.current.add(type)
    void publishLinkRef.current()
  }, [])

  // Must run synchronously inside the Start / Accept click, before any await.
  const primePlayback = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (!audio.srcObject && !audio.src) audio.src = SILENT_WAV
    applyOutput()
  }, [applyOutput])

  const clearTimers = useCallback(() => {
    if (demoTimer.current) window.clearTimeout(demoTimer.current)
    if (waitRef.current) window.clearTimeout(waitRef.current)
    demoTimer.current = null
    waitRef.current = null
  }, [])

  const cleanupMedia = useCallback(() => {
    clearTimers()
    localRef.current?.getTracks().forEach((track) => track.stop())
    localRef.current = null
    pcRef.current?.close()
    pcRef.current = null
    iceQueueRef.current = new Map()
    activeCallRef.current = null
    pendingOfferRef.current = null
    remoteReadyRef.current = false
    roleRef.current = null
    policyRef.current = 'all'
    relayTriedRef.current = false
    relayingRef.current = false
    setRelaying(false)
    candidatesRef.current = new Set()
    if (audioRef.current) {
      audioRef.current.srcObject = null
      audioRef.current.removeAttribute('src')
    }
    speakerRef.current = true
    setSpeakerOn(true)
    setDebug('')
    const peerId = stateRef.current.peer?.id
    if (peerId && mode === 'live') void closeOutbox(peerId)
  }, [clearTimers, mode])

  const deliver = useCallback(
    async (to: Profile, signal: CallSignal) => {
      if (mode !== 'live') return
      await sendSignal(to.id, signal)
    },
    [mode],
  )

  const flushIce = useCallback(async (conversationId: string) => {
    const pc = pcRef.current
    if (!pc || !pc.remoteDescription) return
    remoteReadyRef.current = true
    const taken = takeCandidates(iceQueueRef.current, conversationId)
    iceQueueRef.current = taken.queue
    for (const candidate of taken.candidates) {
      try {
        noteCandidate(candidate.candidate)
        await pc.addIceCandidate({
          candidate: candidate.candidate,
          sdpMid: candidate.sdpMid,
          sdpMLineIndex: candidate.sdpMLineIndex,
        })
      } catch {
        // A late candidate can arrive after the call ends.
      }
    }
  }, [noteCandidate])

  const failFinal = useCallback(
    (message: string) => {
      if (stateRef.current.phase === 'idle' || stateRef.current.phase === 'failed') return
      clearTimers()
      localRef.current?.getTracks().forEach((track) => track.stop())
      localRef.current = null
      pcRef.current?.close()
      pcRef.current = null
      dispatch({ type: 'fail', error: message })
    },
    [clearTimers],
  )

  const publishLink = useCallback(async () => {
    const pc = pcRef.current
    if (!pc) return
    let inbound = 0
    let outbound = 0
    let path = 'none'
    try {
      const stats = await pc.getStats()
      stats.forEach((report) => {
        const kind = 'kind' in report ? report.kind : undefined
        if (report.type === 'inbound-rtp' && kind !== 'video') inbound += Number('bytesReceived' in report ? report.bytesReceived : 0)
        if (report.type === 'outbound-rtp' && kind !== 'video') outbound += Number('bytesSent' in report ? report.bytesSent : 0)
        if (report.type === 'local-candidate' || report.type === 'remote-candidate') {
          if ('candidateType' in report && report.candidateType) candidatesRef.current.add(String(report.candidateType))
        }
        if (report.type === 'transport' && 'selectedCandidatePairId' in report && report.selectedCandidatePairId) {
          const pair = stats.get(String(report.selectedCandidatePairId))
          const localId = pair && 'localCandidateId' in pair ? pair.localCandidateId : undefined
          const local = localId ? stats.get(String(localId)) : undefined
          if (local && 'candidateType' in local && local.candidateType) path = String(local.candidateType)
        }
      })
    } catch {
      return
    }
    const audio = audioRef.current
    const playback = audio && !audio.paused && !audio.muted && audio.srcObject ? 'playing' : 'silent'
    if (inbound > 0) playRemote()
    setDebug(formatCallLink(pc.iceConnectionState, path, inbound, outbound, playback, formatCandidateTypes(candidatesRef.current)))
  }, [playRemote])
  publishLinkRef.current = publishLink

  const openPeer = useCallback(
    async (peer: Profile, conversationId: string, me: Profile, policy: IcePolicy) => {
      let stream = localRef.current
      const live = stream?.getAudioTracks().filter((track) => track.readyState === 'live') ?? []
      if (!stream || live.length === 0) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        localRef.current = stream
      }
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !stateRef.current.muted
      })
      const pc = await createPeerConnection(policy)
      policyRef.current = policy
      pcRef.current = pc
      // Both sides add the microphone before createOffer / createAnswer.
      stream.getAudioTracks().forEach((track) => pc.addTrack(track, stream))
      if (!hasLiveAudioSender(pc.getSenders())) {
        throw new Error('The microphone is not on this call.')
      }
      pc.onicecandidate = (event) => {
        if (pcRef.current !== pc || !event.candidate) return
        noteCandidate(event.candidate.candidate)
        void deliver(peer, {
          kind: 'ice',
          conversationId,
          from: me,
          candidate: event.candidate.toJSON(),
        }).catch(() => {})
      }
      pc.ontrack = (event) => {
        if (pcRef.current !== pc) return
        const audio = audioRef.current
        if (!audio) return
        event.track.enabled = true
        const remote = pickRemoteStream(event.streams, event.track)
        audio.muted = false
        audio.srcObject = remote
        playRemote()
      }
      const markConnected = () => {
        if (pcRef.current !== pc) return
        const ice = pc.iceConnectionState
        if (ice !== 'connected' && ice !== 'completed') return
        playRemote()
        dispatch({ type: 'connected', at: Date.now() })
        void publishLink()
      }
      const giveUp = () => {
        if (pcRef.current !== pc) return
        if (!relayTriedRef.current && policyRef.current === 'all' && roleRef.current === 'caller') {
          noteRelay()
          void restartRelayRef.current()
          return
        }
        if (!relayTriedRef.current && roleRef.current === 'callee') {
          noteRelay()
          return
        }
        failFinal(CONNECT_TIMEOUT_MESSAGE)
      }
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed') giveUp()
        else markConnected()
      }
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') giveUp()
        else markConnected()
      }
      setDebug(formatCallLink(pc.iceConnectionState, 'none', 0, 0, 'silent', formatCandidateTypes(candidatesRef.current)))
      return pc
    },
    [deliver, failFinal, noteCandidate, noteRelay, playRemote, publishLink],
  )

  const restartRelay = useCallback(async () => {
    if (relayTriedRef.current || roleRef.current !== 'caller') return
    const peer = stateRef.current.peer
    const conversationId = stateRef.current.conversationId
    const me = profileRef.current
    if (!peer || !conversationId || !me) return
    relayTriedRef.current = true
    noteRelay()
    const previous = pcRef.current
    pcRef.current = null
    previous?.close()
    remoteReadyRef.current = false
    iceQueueRef.current = new Map()
    try {
      const pc = await openPeer(peer, conversationId, me, 'relay')
      if (!hasLiveAudioSender(pc.getSenders())) throw new Error('The microphone is not on this call.')
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      await waitForIceCandidate(pc)
      const local = pc.localDescription
      if (!local) throw new Error('Could not start the voice call.')
      await deliver(peer, { kind: 'offer', conversationId, from: me, sdp: local.toJSON() })
    } catch (error) {
      failFinal(mediaError(error))
    }
  }, [deliver, failFinal, noteRelay, openPeer])
  restartRelayRef.current = restartRelay

  const answerOffer = useCallback(
    async (from: Profile, conversationId: string, sdp: RTCSessionDescriptionInit, me: Profile, restart: boolean) => {
      if (restart) {
        relayTriedRef.current = true
        noteRelay()
        const previous = pcRef.current
        pcRef.current = null
        previous?.close()
        remoteReadyRef.current = false
        iceQueueRef.current = new Map()
      }
      const policy: IcePolicy = restart ? 'relay' : readIcePolicy()
      let pc = pcRef.current
      if (!pc || restart) pc = await openPeer(from, conversationId, me, policy)
      if (!hasLiveAudioSender(pc.getSenders())) throw new Error('The microphone is not on this call.')
      await pc.setRemoteDescription(sdp)
      await flushIce(conversationId)
      if (!hasLiveAudioSender(pc.getSenders())) throw new Error('The microphone is not on this call.')
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      await waitForIceCandidate(pc)
      const local = pc.localDescription
      if (!local) throw new Error('Could not start the voice call.')
      await deliver(from, { kind: 'answer', conversationId, from: me, sdp: local.toJSON() })
    },
    [deliver, flushIce, noteRelay, openPeer],
  )

  const onSignal = useCallback(
    async (signal: CallSignal) => {
      const me = profileRef.current
      if (!me || signal.from.id === me.id) return
      const phase = stateRef.current.phase
      const currentId = stateRef.current.conversationId

      if (signal.kind === 'offer' && signal.sdp && activeCallRef.current === signal.conversationId) {
        const remote = pcRef.current?.remoteDescription?.sdp
        if (remote && remote !== signal.sdp.sdp) {
          try {
            await answerOffer(signal.from, signal.conversationId, signal.sdp, me, true)
          } catch (error) {
            failFinal(mediaError(error))
          }
          return
        }
        if (!remote) pendingOfferRef.current = signal.sdp
        return
      }

      if (signal.kind === 'ring' || signal.kind === 'offer') {
        if (signal.sdp) pendingOfferRef.current = signal.sdp
        if (phase === 'idle' && !activeCallRef.current) {
          activeCallRef.current = signal.conversationId
          const peer = mode === 'live'
            ? { ...signal.from, isCreator: await profileIsCreator(signal.from.id) }
            : signal.from
          dispatch({ type: 'incoming', conversationId: signal.conversationId, peer })
          return
        }
        if ((currentId ?? activeCallRef.current) === signal.conversationId) return
        if (signal.kind === 'ring') {
          await deliver(signal.from, { kind: 'reject', conversationId: signal.conversationId, from: me })
        }
        return
      }

      if (signal.kind === 'ice' && signal.candidate) {
        iceQueueRef.current = rememberCandidate(
          iceQueueRef.current,
          signal.conversationId,
          signal.candidate,
          activeCallRef.current,
        )
        if (remoteReadyRef.current && activeCallRef.current === signal.conversationId) {
          await flushIce(signal.conversationId)
        }
        return
      }

      if (!currentId || signal.conversationId !== currentId) return

      if (signal.kind === 'answer' && signal.sdp && pcRef.current) {
        if (pcRef.current.signalingState !== 'have-local-offer') return
        const pc = pcRef.current
        dispatch({ type: 'remote-joined' })
        try {
          await pc.setRemoteDescription(signal.sdp)
          await flushIce(signal.conversationId)
        } catch (error) {
          failFinal(mediaError(error))
          return
        }
        if (pcRef.current !== pc) return
        const ice = pc.iceConnectionState
        const link = pc.connectionState
        if (ice === 'connected' || ice === 'completed' || link === 'connected') {
          dispatch({ type: 'connected', at: Date.now() })
        }
        return
      }

      if (signal.kind === 'reject' || signal.kind === 'hangup') {
        cleanupMedia()
        dispatch({ type: 'hangup' })
        setBanner(signal.kind === 'reject' ? 'Call declined' : 'Call ended')
      }
    },
    [answerOffer, cleanupMedia, deliver, failFinal, flushIce, mode],
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

  useEffect(() => {
    if (mode !== 'live' || state.phase === 'idle' || state.phase === 'incoming') return
    void publishLink()
    const timer = window.setInterval(() => void publishLink(), 500)
    return () => window.clearInterval(timer)
  }, [mode, publishLink, state.phase])

  useEffect(() => {
    if (mode !== 'live' || state.phase !== 'connecting') return
    const deadline = window.setTimeout(() => {
      const phase = stateRef.current.phase
      if (phase === 'connecting' || phase === 'outgoing' || phase === 'ringing') failFinal(CONNECT_TIMEOUT_MESSAGE)
    }, CONNECT_TIMEOUT_MS)
    const relay = window.setTimeout(() => {
      if (stateRef.current.phase !== 'connecting') return
      noteRelay()
      if (!relayTriedRef.current && policyRef.current !== 'relay' && roleRef.current === 'caller') {
        void restartRelayRef.current()
      }
    }, RELAY_RETRY_MS)
    return () => {
      window.clearTimeout(deadline)
      window.clearTimeout(relay)
    }
  }, [failFinal, mode, noteRelay, state.phase])

  const startCall = useCallback(
    async (peer: Profile, conversationId: string) => {
      primePlayback()
      const me = profileRef.current
      if (!me || stateRef.current.phase !== 'idle') return
      activeCallRef.current = conversationId
      roleRef.current = 'caller'
      relayTriedRef.current = false
      dispatch({ type: 'start', conversationId, peer })
      setBanner(null)
      if (mode === 'demo') {
        if (sessionStorage.getItem('athera:call-preview') === 'relay') {
          dispatch({ type: 'remote-joined' })
          noteRelay()
          candidatesRef.current = new Set(['host', 'srflx'])
          setDebug(formatCallLink('checking', 'none', 0, 0, 'silent', 'host, srflx'))
          demoTimer.current = window.setTimeout(() => failFinal(CONNECT_TIMEOUT_MESSAGE), CONNECT_TIMEOUT_MS)
          return
        }
        demoTimer.current = window.setTimeout(() => {
          dispatch({ type: 'connected', at: Date.now() })
        }, 1400)
        return
      }
      try {
        const pc = await openPeer(peer, conversationId, me, readIcePolicy())
        if (!hasLiveAudioSender(pc.getSenders())) throw new Error('The microphone is not on this call.')
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        await waitForIceCandidate(pc)
        const local = pc.localDescription
        if (!local) throw new Error('Could not start the voice call.')
        await deliver(peer, { kind: 'ring', conversationId, from: me })
        dispatch({ type: 'ringing' })
        await deliver(peer, { kind: 'offer', conversationId, from: me, sdp: local.toJSON() })
      } catch (error) {
        dispatch({ type: 'fail', error: mediaError(error) })
        localRef.current?.getTracks().forEach((track) => track.stop())
        localRef.current = null
        pcRef.current?.close()
        pcRef.current = null
      }
    },
    [deliver, failFinal, mode, noteRelay, openPeer, primePlayback],
  )

  const accept = useCallback(async () => {
    primePlayback()
    const snap = stateRef.current
    const me = profileRef.current
    if (!me || snap.phase !== 'incoming' || !snap.peer || !snap.conversationId) return
    roleRef.current = 'callee'
    relayTriedRef.current = readIcePolicy() === 'relay'
    dispatch({ type: 'accept' })
    if (mode === 'demo') {
      dispatch({ type: 'connected', at: Date.now() })
      return
    }
    try {
      const started = Date.now()
      let offer = pendingOfferRef.current
      while (!offer && Date.now() - started < 4000) {
        await new Promise((resolve) => setTimeout(resolve, 120))
        offer = pendingOfferRef.current
      }
      if (!offer) throw new Error('Still waiting for the call offer. Ask them to call again.')
      await answerOffer(snap.peer, snap.conversationId, offer, me, false)
      playRemote()
    } catch (error) {
      dispatch({ type: 'fail', error: mediaError(error) })
      localRef.current?.getTracks().forEach((track) => track.stop())
      localRef.current = null
      pcRef.current?.close()
      pcRef.current = null
    }
  }, [answerOffer, mode, playRemote, primePlayback])

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

  const toggleSpeaker = useCallback(() => {
    speakerRef.current = !speakerRef.current
    setSpeakerOn(speakerRef.current)
    applyOutput()
  }, [applyOutput])

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
    connectedAt: state.connectedAt,
    error: state.error,
    banner,
    demo: mode === 'demo',
    debug,
    relaying,
    startCall,
    accept,
    reject,
    hangup,
    toggleMute,
    speakerOn,
    toggleSpeaker,
    simulateIncoming,
    audioRef,
  }

  return (
    <CallContext.Provider value={value}>
      {children}
      <audio ref={audioRef} autoPlay playsInline data-testid="remote-audio" className="pointer-events-none fixed bottom-0 left-0 h-px w-px" />
    </CallContext.Provider>
  )
}

export function useCall(): CallValue {
  const value = useContext(CallContext)
  if (!value) throw new Error('useCall must be used inside CallProvider')
  return value
}
