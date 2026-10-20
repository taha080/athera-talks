export function shouldShowMessageNotice(input: {
  mine: boolean
  deleted: boolean
  muted: boolean
  blocked: boolean
  conversationOpen: boolean
  tabHidden: boolean
}): boolean {
  if (input.mine || input.deleted || input.muted || input.blocked) return false
  if (input.tabHidden) return true
  return !input.conversationOpen
}

export function shouldPlayMessageSound(input: { notifySound: boolean; show: boolean }): boolean {
  return input.show && input.notifySound
}

export function shouldShowDesktopNotification(input: {
  show: boolean
  tabHidden: boolean
  notifyDesktop: boolean
  permissionGranted: boolean
}): boolean {
  return input.show && input.tabHidden && input.notifyDesktop && input.permissionGranted
}

export function noticePreview(message: { body: string; kind?: string | null; deletedAt?: string | null }): string {
  if (message.deletedAt) return 'This message was deleted'
  if (message.kind === 'voice') return 'Voice note'
  if (message.kind === 'image') return 'Photo'
  const text = message.body.replace(/\s+/g, ' ').trim()
  if (text.length <= 90) return text
  return `${text.slice(0, 89)}…`
}

export function stackNotices<T>(current: T[], next: T, max = 3): T[] {
  return [...current, next].slice(-max)
}
