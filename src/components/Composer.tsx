import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CHAT_IMAGE_BYTES, isChatImage, prepareChatImage } from '../lib/pasteImage'
import { assertVideoSize, attachmentFromClipboard, isChatVideo, videoDurationSeconds, videoMime } from '../lib/chatVideo'
import { shouldAnnounceTyping } from '../lib/typing'
import { EMOJI } from '../lib/emoji'
import { encodeWaveform, pickAudioMime } from '../lib/voice'
import { formatDuration } from '../lib/format'
import type { ReplyTarget } from '../types'
import { CloseIcon, ImageIcon, MicIcon, SendIcon, SmileIcon, TrashIcon } from './Icons'

type Phase = 'idle' | 'recording'

export function Composer({
  peerName,
  reply,
  onClearReply,
  onSendText,
  onSendFile,
  onTyping,
  editing = null,
  onCancelEdit,
  incomingFile = null,
  onIncomingHandled,
}: {
  peerName: string
  reply: ReplyTarget | null
  onClearReply: () => void
  onSendText: (body: string) => Promise<void>
  onSendFile: (
    file: Blob,
    mime: string,
    kind: 'voice' | 'image' | 'video',
    seconds?: number,
    waveform?: number[],
    caption?: string,
    hooks?: { onProgress?: (loaded: number, total: number) => void; signal?: AbortSignal },
  ) => Promise<void>
  onTyping: (typing: boolean) => void
  editing?: { id: string; body: string } | null
  onCancelEdit?: () => void
  incomingFile?: File | null
  onIncomingHandled?: () => void
}) {
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState<
    | { kind: 'image'; file: File; url: string }
    | { kind: 'video'; file: File; url: string; seconds: number | null }
    | null
  >(null)
  const [upload, setUpload] = useState<{ loaded: number; total: number } | null>(null)
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
  const editingId = editing?.id

  useEffect(() => {
    if (!editingId) return
    setDraft(editing?.body ?? '')
  }, [editing?.body, editingId])
  const starting = useRef(false)
  const lastType = useRef(0)
  const box = useRef<HTMLTextAreaElement>(null)

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

  const typingOn = useRef(false)
  const pendingUrl = useRef<string | null>(null)
  const sendingPhoto = useRef(false)
  const uploadAbort = useRef<AbortController | null>(null)
  const notifyTyping = useRef(onTyping)
  notifyTyping.current = onTyping

  function stopTyping() {
    if (!typingOn.current) return
    typingOn.current = false
    notifyTyping.current(false)
  }

  function noteTyping(value: string) {
    setDraft(value)
    if (editing) return
    const text = value.trim()
    if (!text) {
      stopTyping()
      return
    }
    const now = Date.now()
    if (typingOn.current && !shouldAnnounceTyping(text, lastType.current, now)) return
    lastType.current = now
    typingOn.current = true
    notifyTyping.current(true)
  }

  function clearPending() {
    if (pendingUrl.current) URL.revokeObjectURL(pendingUrl.current)
    pendingUrl.current = null
    setPending(null)
  }

  function stageImage(file: File) {
    if (editing) return
    setError('')
    if (!isChatImage(file)) {
      setError('Choose an image file.')
      return
    }
    if (file.size > CHAT_IMAGE_BYTES) {
      setError('Choose an image under 30 MB.')
      return
    }
    if (pendingUrl.current) URL.revokeObjectURL(pendingUrl.current)
    const url = URL.createObjectURL(file)
    pendingUrl.current = url
    setUpload(null)
    setPending({ kind: 'image', file, url })
  }

  function stageVideo(file: File) {
    if (editing) return
    setError('')
    if (!isChatVideo(file)) {
      setError('Choose an mp4, webm, or mov video.')
      return
    }
    try {
      assertVideoSize(file.size)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Choose a video under 50 MB.')
      return
    }
    if (pendingUrl.current) URL.revokeObjectURL(pendingUrl.current)
    const url = URL.createObjectURL(file)
    pendingUrl.current = url
    setUpload(null)
    setPending({ kind: 'video', file, url, seconds: null })
  }

  function stageAttachment(file: File) {
    if (isChatVideo(file)) stageVideo(file)
    else stageImage(file)
  }

  useEffect(() => {
    if (!incomingFile) return
    stageAttachment(incomingFile)
    onIncomingHandled?.()
  }, [incomingFile])

  useEffect(() => () => {
    if (pendingUrl.current) URL.revokeObjectURL(pendingUrl.current)
  }, [])

  useEffect(() => {
    function onHide() {
      if (document.visibilityState === 'hidden') stopTyping()
    }
    document.addEventListener('visibilitychange', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      stopTyping()
    }
  }, [])

  function cancelStaged() {
    if (upload) {
      uploadAbort.current?.abort()
      return
    }
    clearPending()
  }

  async function sendPending() {
    if (!pending || sendingPhoto.current) return
    sendingPhoto.current = true
    const staged = pending
    const caption = draft.trim()
    setError('')
    const controller = new AbortController()
    uploadAbort.current = controller
    try {
      if (staged.kind === 'video') {
        setUpload({ loaded: 0, total: staged.file.size })
        await onSendFile(staged.file, videoMime(staged.file), 'video', staged.seconds ?? undefined, undefined, caption, {
          signal: controller.signal,
          onProgress: (loaded, total) => setUpload({ loaded, total }),
        })
      } else {
        const prepared = await prepareChatImage(staged.file)
        await onSendFile(prepared.blob, prepared.mime, 'image', undefined, undefined, caption)
      }
      clearPending()
      setUpload(null)
      setDraft('')
      stopTyping()
      setEmojiOpen(false)
      if (box.current) box.current.style.height = 'auto'
    } catch (err) {
      setUpload(null)
      const message = err instanceof Error ? err.message : 'Could not send that photo.'
      setError(controller.signal.aborted ? 'Upload cancelled.' : message)
    } finally {
      uploadAbort.current = null
      sendingPhoto.current = false
    }
  }

  async function submitText() {
    if (pending && !editing) {
      await sendPending()
      return
    }
    const body = draft.trim()
    if (!body) return
    setDraft('')
    stopTyping()
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
      const prepared = await prepareChatImage(file)
      await onSendFile(prepared.blob, prepared.mime, 'image')
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
    media.start(250)
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
      void audio.resume()
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
      setError('Record a little longer.')
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

  async function startRecording() {
    if (phase !== 'idle' || starting.current) return
    starting.current = true
    try {
      await begin()
    } catch (err) {
      stopTracks()
      recorder.current = null
      setPhase('idle')
      setError(err instanceof Error ? err.message : 'Microphone permission is needed.')
    } finally {
      starting.current = false
    }
  }

  const recording = phase !== 'idle'

  return (
    <div className="composer-shell rounded-xl border border-line bg-panel px-2 py-1.5 shadow-md">
      {editing ? (
        <div className="mb-2 flex items-center gap-2 rounded-lg border-l-4 border-sakura bg-elevated px-3 py-2 text-sm">
          <p className="min-w-0 flex-1 truncate text-mist">Editing message</p>
          <button type="button" aria-label="Cancel edit" onClick={onCancelEdit}>
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      {reply && !editing ? (
        <div className="mb-2 flex items-center gap-2 rounded-lg border-l-4 border-sakura bg-elevated px-3 py-2 text-sm">
          <p className="min-w-0 flex-1 truncate text-mist">{reply.preview}</p>
          <button type="button" aria-label="Cancel reply" onClick={onClearReply}>
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      {pending?.kind === 'image' && !editing ? (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-elevated px-2 py-2" data-photo-preview="true">
          <img src={pending.url} alt="" className="h-14 w-14 rounded-lg object-cover" />
          <p className="min-w-0 flex-1 truncate text-xs text-mist">{draft.trim() ? draft.trim() : 'Photo ready'}</p>
          <button type="button" className="rounded-lg px-2 py-1 text-sm text-mist hover:text-paper" onClick={clearPending}>
            Cancel
          </button>
          <button type="button" className="rounded-lg bg-sakura px-3 py-1 text-sm font-medium text-white" onClick={() => void sendPending()}>
            Send
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
              onClick={() => noteTyping(`${draft}${emoji}`)}
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}
      {recording ? (
        <div className="flex items-center gap-2 px-1" role="group" aria-label="Voice recording">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#e5484d]" />
          <p className="tabular-nums text-sm font-medium">{formatDuration(seconds)}</p>
          <span className="min-w-0 flex-1" />
          <button type="button" className="hover-wash grid h-10 w-10 shrink-0 place-items-center rounded-full text-mist hover:text-paper" aria-label="Discard recording" onClick={() => void finish(false)}>
            <TrashIcon className="h-5 w-5" />
          </button>
          <button type="button" className="send-button grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sakura text-white transition hover:brightness-110" aria-label="Send voice message" onClick={() => void finish(true)}>
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
          {editing ? null : (
          <label className="hover-wash grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-full text-mist hover:text-paper" aria-label="Attach a photo or video">
            <ImageIcon className="h-5 w-5" />
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (!file) return
                if (isChatVideo(file)) stageVideo(file)
                else void onImage(file)
              }}
            />
          </label>
          )}
          <label className="min-w-0 flex-1">
            <span className="sr-only">Message</span>
            <textarea
              ref={box}
              className="max-h-32 min-h-10 w-full resize-none bg-transparent px-1 py-2.5 text-sm leading-5 text-paper outline-none placeholder:text-mist/70"
              rows={1}
              maxLength={4000}
              value={draft}
              placeholder={editing ? 'Edit message' : pending ? 'Add a caption' : `Message ${peerName}`}
              onBlur={() => stopTyping()}
              onPaste={(event) => {
                const file = attachmentFromClipboard(event.clipboardData)
                if (!file) return
                event.preventDefault()
                stageAttachment(file)
              }}
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
          {draft.trim() || editing || pending ? (
            <button type="submit" className="send-button grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sakura text-white transition hover:brightness-110" aria-label={editing ? 'Save edit' : 'Send message'}>
              <SendIcon className="h-5 w-5" />
            </button>
          ) : (
            <button
              type="button"
              className="send-button grid h-10 w-10 shrink-0 touch-manipulation place-items-center rounded-full bg-sakura text-white transition hover:brightness-110"
              aria-label="Record voice message"
              onClick={() => void startRecording()}
            >
              <MicIcon className="h-5 w-5" />
            </button>
          )}
        </form>
      )}
      {error ? <p className="px-1 pt-2 text-sm text-danger" role="alert">{error}</p> : null}
      {pending?.kind === 'video' && !editing
        ? createPortal(
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-label="Video preview" data-video-preview="true">
          <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-3 shadow-md">
            <video
              src={pending.url}
              controls
              playsInline
              preload="metadata"
              className="max-h-64 w-full rounded-xl bg-black"
              onLoadedMetadata={(event) => {
                const seconds = videoDurationSeconds(event.currentTarget.duration)
                setPending((current) => (current?.kind === 'video' ? { ...current, seconds } : current))
              }}
            />
            <label className="mt-3 block">
              <span className="sr-only">Caption</span>
              <textarea
                className="max-h-24 w-full resize-none rounded-lg bg-elevated px-3 py-2 text-sm text-paper outline-none placeholder:text-mist/70"
                rows={2}
                maxLength={4000}
                value={draft}
                placeholder="Add a caption"
                onChange={(event) => noteTyping(event.target.value)}
              />
            </label>
            {upload ? (
              <div className="mt-3">
                <div className="h-1.5 overflow-hidden rounded-full bg-line" data-video-progress="true" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={upload.total > 0 ? Math.round((upload.loaded / upload.total) * 100) : 0}>
                  <div className="h-full bg-sakura" style={{ width: `${upload.total > 0 ? Math.round((upload.loaded / upload.total) * 100) : 0}%` }} />
                </div>
                <p className="mt-1 text-xs text-mist">{upload.total > 0 ? Math.round((upload.loaded / upload.total) * 100) : 0}%</p>
              </div>
            ) : null}
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="rounded-lg px-3 py-1.5 text-sm text-mist hover:text-paper" onClick={cancelStaged}>
                Cancel
              </button>
              <button type="button" className="rounded-lg bg-sakura px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60" disabled={Boolean(upload)} onClick={() => void sendPending()}>
                Send
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )
        : null}
    </div>
  )
}
