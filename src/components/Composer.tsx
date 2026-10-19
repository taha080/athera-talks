import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useCall } from '../context/CallContext'
import { useChat } from '../context/ChatContext'
import { EMOJI } from '../lib/emoji'
import { fitImage } from '../lib/image'
import { formatDuration } from '../lib/format'
import { collectRecording, createAudioRecorder, encodeWaveform, RECORDER_TIMESLICE_MS } from '../lib/voice'
import type { ReplyTarget } from '../types'
import { CloseIcon, ImageIcon, MicIcon, SendIcon, SmileIcon } from './Icons'

type Phase = 'idle' | 'recording' | 'sending'

function callOwnsMic(phase: string): boolean {
  return phase !== 'idle' && phase !== 'failed'
}

export function Composer({
  peerName,
  reply,
  onClearReply,
  onSendText,
  onSendFile,
  onTyping,
}: {
  peerName: string
  reply: ReplyTarget | null
  onClearReply: () => void
  onSendText: (body: string) => Promise<void>
  onSendFile: (file: Blob, mime: string, kind: 'voice' | 'image', seconds?: number, waveform?: number[]) => Promise<void>
  onTyping: () => void
}) {
  const chat = useChat()
  const call = useCall()
  const [draft, setDraft] = useState('')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState('')
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const stream = useRef<MediaStream | null>(null)
  const started = useRef(0)
  const peaks = useRef<number[]>([])
  const mime = useRef('')
  const timer = useRef<number | null>(null)
  const peakTimer = useRef<number | null>(null)
  const audioContext = useRef<AudioContext | null>(null)
  const finishing = useRef(false)
  const stopping = useRef(false)
  const starting = useRef(false)
  const lastType = useRef(0)
  const box = useRef<HTMLTextAreaElement>(null)
  const phaseRef = useRef<Phase>('idle')
  const callPhase = useRef(call.phase)
  const sendFileRef = useRef(onSendFile)
  const toastRef = useRef(chat.pushToast)
  const finishRef = useRef<(send: boolean, discardNote?: string) => Promise<void>>(async () => {})
  callPhase.current = call.phase
  sendFileRef.current = onSendFile
  toastRef.current = chat.pushToast

  function setPhaseSafe(next: Phase) {
    phaseRef.current = next
    setPhase(next)
  }

  function report(message: string) {
    setError(message)
    toastRef.current(message)
  }

  useEffect(() => {
    return () => {
      stopping.current = true
      stopTracks()
    }
  }, [])

  useEffect(() => {
    if (phaseRef.current !== 'recording' || !callOwnsMic(call.phase)) return
    void finishRef.current(false, 'End the call before recording a voice note.')
  }, [call.phase])

  function stopTracks() {
    if (timer.current) window.clearInterval(timer.current)
    if (peakTimer.current) window.clearInterval(peakTimer.current)
    timer.current = null
    peakTimer.current = null
    stream.current?.getTracks().forEach((track) => track.stop())
    stream.current = null
    void audioContext.current?.close()
    audioContext.current = null
  }

  function grow(node: HTMLTextAreaElement | null) {
    if (!node) return
    node.style.height = '0px'
    node.style.height = `${Math.min(node.scrollHeight, 128)}px`
  }

  function noteTyping(value: string) {
    setDraft(value)
    const now = Date.now()
    if (now - lastType.current < 1500) return
    lastType.current = now
    onTyping()
  }

  async function submitText() {
    const body = draft.trim()
    if (!body) return
    setDraft('')
    setEmojiOpen(false)
    if (box.current) box.current.style.height = 'auto'
    setError('')
    try {
      await onSendText(body)
    } catch (err) {
      setDraft(body)
      setError(err instanceof Error ? err.message : 'Could not send.')
    }
  }

  async function onImage(file: File | undefined) {
    if (!file) return
    setError('')
    try {
      if (!file.type.startsWith('image/')) throw new Error('Choose an image file.')
      if (file.size > 8_000_000) throw new Error('Choose an image under 8 MB.')
      const blob = await fitImage(file, 1600)
      await onSendFile(blob, 'image/jpeg', 'image')
      setEmojiOpen(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not send that photo.'
      setError(message)
      chat.pushToast(message)
    }
  }

  async function finish(send: boolean, discardNote?: string) {
    if (finishing.current) return
    finishing.current = true
    stopping.current = true
    const media = recorder.current
    const elapsed = Math.max(1, Math.round((Date.now() - started.current) / 1000))
    const type = mime.current || media?.mimeType || 'audio/webm'
    if (!media) {
      stopTracks()
      recorder.current = null
      finishing.current = false
      setPhaseSafe('idle')
      if (discardNote) report(discardNote)
      return
    }
    const blob = await collectRecording(media, chunks.current, type)
    stopTracks()
    recorder.current = null
    if (!send) {
      finishing.current = false
      setPhaseSafe('idle')
      if (discardNote) report(discardNote)
      return
    }
    if (blob.size < 400) {
      finishing.current = false
      setPhaseSafe('idle')
      report('That recording was empty. Tap the mic and try again.')
      return
    }
    setError('')
    flushSync(() => setPhaseSafe('sending'))
    try {
      const waveform = encodeWaveform(peaks.current).split(',').filter(Boolean).map(Number)
      await sendFileRef.current(blob, type, 'voice', elapsed, waveform)
      setPhaseSafe('idle')
    } catch (err) {
      setPhaseSafe('idle')
      report(err instanceof Error ? err.message : 'Could not send that voice note.')
    } finally {
      finishing.current = false
    }
  }
  finishRef.current = finish

  function onMicLost() {
    if (stopping.current || finishing.current || phaseRef.current !== 'recording') return
    const message = callOwnsMic(callPhase.current)
      ? 'End the call before recording a voice note.'
      : 'The microphone disconnected. Tap the mic and record again.'
    void finishRef.current(false, message)
  }

  async function begin() {
    if (starting.current || phaseRef.current !== 'idle') return
    if (callOwnsMic(callPhase.current)) {
      report('End the call before recording a voice note.')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      report('This browser cannot record voice notes.')
      return
    }
    starting.current = true
    setError('')
    stopping.current = false
    try {
      const live = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (callOwnsMic(callPhase.current) || phaseRef.current !== 'idle') {
        live.getTracks().forEach((track) => track.stop())
        report('End the call before recording a voice note.')
        return
      }
      stream.current = live
      live.getAudioTracks().forEach((track) => {
        track.addEventListener('ended', onMicLost)
      })
      const created = createAudioRecorder(live, {
        supported: (type) => (typeof MediaRecorder.isTypeSupported === 'function' ? MediaRecorder.isTypeSupported(type) : false),
        create: (source, mimeType) => (mimeType ? new MediaRecorder(source, { mimeType }) : new MediaRecorder(source)),
      })
      mime.current = created.mimeType
      chunks.current = []
      peaks.current = []
      created.recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data)
      }
      recorder.current = created.recorder
      created.recorder.start(RECORDER_TIMESLICE_MS)
      started.current = Date.now()
      setSeconds(0)
      setPhaseSafe('recording')
      timer.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - started.current) / 1000)
        setSeconds(elapsed)
        if (elapsed >= 120) void finishRef.current(true)
      }, 200)
      const Context = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (Context) {
        const audio = new Context()
        audioContext.current = audio
        const source = audio.createMediaStreamSource(live)
        const analyser = audio.createAnalyser()
        analyser.fftSize = 256
        source.connect(analyser)
        const data = new Uint8Array(analyser.fftSize)
        peakTimer.current = window.setInterval(() => {
          analyser.getByteTimeDomainData(data)
          let peak = 0
          for (const value of data) peak = Math.max(peak, Math.abs(value - 128))
          peaks.current.push(Math.round((peak / 128) * 100))
        }, 100)
      }
    } catch (err) {
      stopping.current = true
      stopTracks()
      recorder.current = null
      setPhaseSafe('idle')
      const name = err && typeof err === 'object' && 'name' in err ? String(err.name) : ''
      const denied = name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError'
      report(
        denied
          ? 'Microphone permission is needed. Allow the mic for this site and tap again.'
          : err instanceof Error
            ? err.message
            : 'Microphone permission is needed. Allow the mic for this site and tap again.',
      )
    } finally {
      starting.current = false
    }
  }

  return (
    <div className="rounded-xl border border-line bg-panel px-2 py-1.5 shadow-md">
      {reply ? (
        <div className="mb-2 flex items-center gap-2 rounded-lg border-l-4 border-sakura bg-elevated px-3 py-2 text-sm">
          <p className="min-w-0 flex-1 truncate text-mist">{reply.preview}</p>
          <button type="button" aria-label="Cancel reply" onClick={onClearReply}>
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      {emojiOpen ? (
        <div className="mb-2 grid grid-cols-8 gap-1 rounded-lg bg-elevated p-2" role="listbox" aria-label="Emoji">
          {EMOJI.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="hover-wash rounded-lg py-1 text-lg"
              onClick={() => {
                setDraft((value) => `${value}${emoji}`)
                onTyping()
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}
      {phase === 'sending' ? (
        <div className="flex items-center gap-2 px-1 py-2" data-testid="voice-sending" role="status">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-sakura" />
          <p className="text-sm text-mist">Sending voice note…</p>
        </div>
      ) : phase === 'recording' ? (
        <div className="flex items-center gap-2 px-1" data-testid="voice-recording">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#e5484d]" />
          <p className="tabular-nums text-sm font-medium">{formatDuration(seconds)}</p>
          <p className="min-w-0 flex-1 text-center text-sm text-mist">Tap send when you’re done</p>
          <button type="button" className="touch-manipulation rounded-full px-3 py-2 text-sm text-mist hover:text-paper" aria-label="Cancel voice message" onClick={() => void finish(false)}>
            Cancel
          </button>
          <button type="button" className="touch-manipulation grid h-10 w-10 place-items-center rounded-full bg-sakura text-white" aria-label="Send voice message" onClick={() => void finish(true)}>
            <SendIcon className="h-5 w-5" />
          </button>
        </div>
      ) : (
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void submitText()
          }}
        >
          <button type="button" className="hover-wash grid h-10 w-10 shrink-0 place-items-center rounded-full text-mist hover:text-paper" aria-label="Emoji" aria-expanded={emojiOpen} onClick={() => setEmojiOpen((open) => !open)}>
            <SmileIcon className="h-5 w-5" />
          </button>
          <label className="hover-wash grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-full text-mist hover:text-paper" aria-label="Attach a photo">
            <ImageIcon className="h-5 w-5" />
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              onChange={(event) => {
                void onImage(event.target.files?.[0])
                event.target.value = ''
              }}
            />
          </label>
          <label className="min-w-0 flex-1">
            <span className="sr-only">Message</span>
            <textarea
              ref={box}
              className="max-h-32 min-h-10 w-full resize-none bg-transparent px-1 py-2.5 text-sm leading-5 text-paper outline-none placeholder:text-mist/70"
              rows={1}
              maxLength={4000}
              value={draft}
              placeholder={`Message @${peerName}`}
              onChange={(event) => {
                noteTyping(event.target.value)
                grow(event.target)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void submitText()
                }
              }}
            />
          </label>
          {draft.trim() ? (
            <button type="submit" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sakura text-white transition hover:brightness-110" aria-label="Send message">
              <SendIcon className="h-5 w-5" />
            </button>
          ) : (
            <button
              type="button"
              className="touch-manipulation grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sakura text-white transition hover:brightness-110"
              aria-label="Record voice message"
              onClick={() => void begin()}
            >
              <MicIcon className="h-5 w-5" />
            </button>
          )}
        </form>
      )}
      {error ? <p className="px-1 pt-2 text-sm text-danger" role="alert">{error}</p> : null}
    </div>
  )
}
