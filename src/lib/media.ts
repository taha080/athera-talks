export function mediaBucket(kind: 'voice' | 'image'): 'voice-messages' | 'chat-images' {
  return kind === 'image' ? 'chat-images' : 'voice-messages'
}

export function baseMime(mime: string): string {
  const base = mime.split(';')[0]?.trim().toLowerCase() || 'application/octet-stream'
  if (base === 'audio/x-m4a' || base === 'audio/m4a' || base === 'video/mp4') return 'audio/mp4'
  // Android Chrome sometimes labels an audio-only take as video/webm.
  if (base === 'video/webm') return 'audio/webm'
  return base
}
