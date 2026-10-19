export const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/mpeg'] as const

// Chrome on Android only flushes a final chunk when start() was given a timeslice.
export const RECORDER_TIMESLICE_MS = 250

export type VoiceTapPhase = 'idle' | 'recording' | 'sending'

// One control stays on screen. A touch fires pointerup and a later click; the click must not run again.
export function nextVoiceTap(phase: VoiceTapPhase, hasDraft: boolean, clickAlreadyHandled: boolean): 'record' | 'send-voice' | 'send-text' | 'ignore' {
  if (clickAlreadyHandled || phase === 'sending') return 'ignore'
  if (phase === 'recording') return 'send-voice'
  if (hasDraft) return 'send-text'
  return 'record'
}

export function pickAudioMime(supported: (type: string) => boolean): string {
  return MIME_CANDIDATES.find((type) => supported(type)) ?? ''
}

// Try each supported type. Android Chrome can report webm as supported and then throw.
export function createAudioRecorder(
  stream: MediaStream,
  options: {
    supported: (type: string) => boolean
    create: (stream: MediaStream, mimeType: string) => MediaRecorder
  },
): { recorder: MediaRecorder; mimeType: string } {
  const supported = MIME_CANDIDATES.filter((type) => options.supported(type))
  const attempts = supported.length > 0 ? [...supported] : ['']
  let last: unknown
  for (const mimeType of attempts) {
    try {
      const recorder = options.create(stream, mimeType)
      return { recorder, mimeType: mimeType || recorder.mimeType || 'audio/webm' }
    } catch (error) {
      last = error
    }
  }
  throw last instanceof Error ? last : new Error('This browser cannot record voice notes.')
}

// Wait past the stop event so a late dataavailable chunk is included.
export function collectRecording(media: MediaRecorder, chunks: Blob[], mimeType: string): Promise<Blob> {
  const type = (mimeType.split(';')[0] || 'audio/webm').trim()
  const pack = () => new Blob(chunks, { type })
  if (media.state === 'inactive') return Promise.resolve(pack())
  return new Promise((resolve) => {
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      setTimeout(() => resolve(pack()), 40)
    }
    const backup = setTimeout(done, 1500)
    media.addEventListener(
      'stop',
      () => {
        clearTimeout(backup)
        done()
      },
      { once: true },
    )
    try {
      if (media.state === 'recording') media.requestData()
    } catch {
      // requestData is optional. stop() still flushes on browsers that support it.
    }
    try {
      media.stop()
    } catch {
      clearTimeout(backup)
      done()
    }
  })
}

export function mediaSendError(message: string, kind: 'voice' | 'image' = 'voice'): string {
  const note = kind === 'voice' ? 'voice note' : 'photo'
  const text = message.toLowerCase()
  if (text.includes('row-level security') || text.includes('accepted contact') || text.includes('not a member')) {
    return `That ${note} was blocked. You can only send one to an accepted contact.`
  }
  if (text.includes('mime') || text.includes('content type') || text.includes('invalid mime')) {
    return kind === 'voice'
      ? 'The voice note format was rejected. Tap the mic and try again.'
      : 'The photo format was rejected. Choose a JPEG, PNG, or WebP image.'
  }
  if (text.includes('payload too large') || text.includes('exceeded') || text.includes('too large')) {
    return kind === 'voice'
      ? 'That voice note is too large. Keep a voice note under two minutes.'
      : 'That photo is too large. Choose an image under 8 MB.'
  }
  return message || `Could not send that ${note}.`
}

export function extensionForMime(mime: string): string {
  const base = mime.split(';')[0]?.trim().toLowerCase() ?? ''
  if (base.includes('mp4') || base.includes('aac') || base.includes('m4a')) return 'm4a'
  if (base.includes('mpeg')) return 'mp3'
  if (base.includes('ogg')) return 'ogg'
  if (base.includes('wav')) return 'wav'
  return 'webm'
}

export function parseWaveform(value: string | null | undefined): number[] {
  if (!value) return []
  return value
    .split(',')
    .map((part) => Number(part))
    .filter((part) => Number.isFinite(part))
    .slice(0, 64)
}

export function encodeWaveform(values: number[]): string {
  return values
    .slice(0, 64)
    .map((value) => Math.max(0, Math.min(100, Math.round(value))))
    .join(',')
}
