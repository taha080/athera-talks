import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { EMOJI } from '../lib/emoji'
import { fitImage } from '../lib/image'
import { fieldClass } from '../lib/styles'
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
      className="border-t border-line px-3 py-3"
      onPointerUp={onMicUp}
      onPointerCancel={() => {
        holding.current = false
        if (!locked.current && recorder.current) void finish(false)
      }}
    >
      {reply ? (
        <div className="mb-2 flex items-center gap-2 rounded-2xl border-l-4 border-sakura bg-white/5 px-3 py-2 text-sm">
          <p className="min-w-0 flex-1 truncate text-mist">{reply.preview}</p>
          <button type="button" aria-label="Cancel reply" onClick={onClearReply}>
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      {emojiOpen ? (
        <div className="mb-2 grid grid-cols-8 gap-1 rounded-2xl bg-elevated p-2" role="listbox" aria-label="Emoji">
          {EMOJI.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="rounded-lg py-1 text-lg hover:bg-white/10"
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
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-sakura" />
          <p className="min-w-0 flex-1 text-sm">{phase === 'locked' ? 'Tap send to share' : 'Recording'} · {formatDuration(seconds)}</p>
          <button type="button" className="rounded-full px-3 py-2 text-sm text-mist" onClick={() => void finish(false)}>
            Cancel
          </button>
          {phase === 'locked' ? (
            <button type="button" className="grid h-12 w-12 place-items-center rounded-full bg-white text-ink" aria-label="Send voice message" onClick={() => void finish(true)}>
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
          <button type="button" className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-white/5" aria-label="Emoji" onClick={() => setEmojiOpen((open) => !open)}>
            <SmileIcon className="h-5 w-5" />
          </button>
          <label className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full hover:bg-white/5" aria-label="Send a photo">
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
              className={`${fieldClass} max-h-32 resize-none`}
              rows={1}
              maxLength={4000}
              value={draft}
              placeholder={`Message @${peerName}`}
              onChange={(event) => noteTyping(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void submitText()
                }
              }}
            />
          </label>
          {draft.trim() ? (
            <button type="submit" className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white text-ink" aria-label="Send message">
              <SendIcon className="h-5 w-5" />
            </button>
          ) : (
            <button
              type="button"
              className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white text-ink"
              aria-label="Record voice message"
              onPointerDown={(event) => void onMicDown(event)}
            >
              <MicIcon className="h-5 w-5" />
            </button>
          )}
        </form>
      )}
      {error ? <p className="px-1 pt-2 text-sm text-sakura">{error}</p> : null}
    </div>
  )
}
