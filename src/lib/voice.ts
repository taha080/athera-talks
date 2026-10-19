const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/mpeg'] as const

export function pickAudioMime(supported: (type: string) => boolean): string {
  return MIME_CANDIDATES.find((type) => supported(type)) ?? ''
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
