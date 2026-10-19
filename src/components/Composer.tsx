import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { EMOJI } from '../lib/emoji'
import { fitImage } from '../lib/image'
import { encodeWaveform, pickAudioMime } from '../lib/voice'
import { formatDuration } from '../lib/format'
import type { ReplyTarget } from '../types'
import { CloseIcon, ImageIcon, MicIcon, SendIcon, SmileIcon } from './Icons'

type Phase = 'idle' | 'recording' | 'locked'

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
  const holding = useRef(false)
  const locked = useRef(false)
  const finishing = useRef(false)
  const lastType = useRef(0)
  const shell = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  const originX = useRef(0)
  const [slide, setSlide] = useState(0)

  useEffect(() => {
    return () => {
      stopTracks()
    }
  }, [])

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
      setError(err instanceof Error ? err.message : 'Could not send that photo.')
    }
  }

  async function begin() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('This browser cannot record voice notes.')
      return
    }
    setError('')
    const live = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.current = live
    const chosen = pickAudioMime((type) => MediaRecorder.isTypeSupported(type))
    mime.current = chosen
    const media = chosen ? new MediaRecorder(live, { mimeType: chosen }) : new MediaRecorder(live)
    chunks.current = []
    peaks.current = []
    media.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.current.push(event.data)
    }
    recorder.current = media
    media.start()
    started.current = Date.now()
    setSeconds(0)
    setPhase('recording')
    timer.current = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - started.current) / 1000)
      setSeconds(elapsed)
      if (elapsed >= 120) void finish(true)
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
  }

  async function finish(send: boolean) {
    if (finishing.current) return
    finishing.current = true
    const media = recorder.current
    const elapsed = Math.max(1, Math.round((Date.now() - started.current) / 1000))
    const type = mime.current || media?.mimeType || 'audio/webm'
    locked.current = false
    holding.current = false
    if (!media) {
      stopTracks()
      finishing.current = false
      setPhase('idle')
      return
    }
    const blob = await new Promise<Blob>((resolve) => {
      media.onstop = () => {
        resolve(new Blob(chunks.current, { type: type.split(';')[0] || 'audio/webm' }))
      }
      if (media.state !== 'inactive') media.stop()
      else resolve(new Blob(chunks.current, { type: type.split(';')[0] || 'audio/webm' }))
    })
    stopTracks()
    recorder.current = null
    finishing.current = false
    setPhase('idle')
    if (!send) return
    if (blob.size < 400) {
      setError('Hold the mic a little longer.')
      return
    }
    setError('')
    try {
      const waveform = encodeWaveform(peaks.current).split(',').filter(Boolean).map(Number)
      await onSendFile(blob, type, 'voice', elapsed, waveform)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send that voice note.')
    }
  }

  async function onMicDown(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    if (phase !== 'idle') return
    holding.current = true
    try {
      originX.current = event.clientX
      setSlide(0)
      shell.current?.setPointerCapture(event.pointerId)
      await begin()
      if (!holding.current && !locked.current) {
        await finish(false)
      }
    } catch (err) {
      stopTracks()
      setPhase('idle')
      setError(err instanceof Error ? err.message : 'Microphone permission is needed.')
    }
  }

  function onMicUp() {
    if (phase !== 'recording' || locked.current) {
      holding.current = false
      return
    }
    const elapsed = Date.now() - started.current
    holding.current = false
    if (elapsed < 400) {
      locked.current = true
      setPhase('locked')
      return
    }
    void finish(true)
  }

  const recording = phase !== 'idle'

  return (
    <div
      ref={shell}
      className="rounded-[24px] border border-line bg-panel px-2 py-1.5 shadow-md"
      onPointerUp={onMicUp}
      onPointerMove={(event) => {
        if (phase !== 'recording' || locked.current) return
        const dx = Math.min(0, event.clientX - originX.current)
        setSlide(dx)
        if (dx < -88) void finish(false)
      }}
      onPointerCancel={() => {
        holding.current = false
        if (!locked.current && recorder.current) void finish(false)
      }}
    >
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
      {recording ? (
        <div className="flex items-center gap-2 px-1">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#e5484d]" />
          <p className="tabular-nums text-sm font-medium">{formatDuration(seconds)}</p>
          <p className="min-w-0 flex-1 text-center text-sm text-mist" style={{ transform: `translateX(${slide}px)` }}>
            {phase === 'locked' ? 'Tap send to share' : 'Slide to cancel'}
          </p>
          <button type="button" className="rounded-full px-3 py-2 text-sm text-mist hover:text-paper" onClick={() => void finish(false)}>
            Cancel
          </button>
          {phase === 'locked' ? (
            <button type="button" className="grid h-10 w-10 place-items-center rounded-full bg-sakura text-white" aria-label="Send voice message" onClick={() => void finish(true)}>
              <SendIcon className="h-5 w-5" />
            </button>
          ) : null}
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
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sakura text-white transition hover:brightness-110"
              aria-label="Record voice message"
              onPointerDown={(event) => void onMicDown(event)}
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
