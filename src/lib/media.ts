export function mediaBucket(kind: 'voice' | 'image' | 'video'): 'voice-messages' | 'chat-images' | 'chat-videos' {
  if (kind === 'image') return 'chat-images'
  if (kind === 'video') return 'chat-videos'
  return 'voice-messages'
}

export function baseMime(mime: string): string {
  const base = mime.split(';')[0]?.trim().toLowerCase() || 'application/octet-stream'
  if (base === 'audio/x-m4a' || base === 'audio/m4a' || base === 'video/mp4') return 'audio/mp4'
  return base
}
