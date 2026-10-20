export type CallType = 'voice' | 'video'
export type CallStatus = 'completed' | 'missed' | 'declined' | 'cancelled'

export function formatCallDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const rest = total % 60
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

export function callLogLabel(input: {
  callType: CallType
  status: CallStatus
  durationSeconds: number
  callerId: string
  meId: string
}): string {
  const media = input.callType === 'video' ? 'video' : 'voice'
  if (input.status === 'missed') return `Missed ${media} call`
  if (input.status === 'declined') return `Declined ${media} call`
  if (input.status === 'cancelled') return `Cancelled ${media} call`
  const direction = input.callerId === input.meId ? 'Outgoing' : 'Incoming'
  return `${direction} ${media} call, ${formatCallDuration(input.durationSeconds)}`
}

export function endedCallStatus(input: {
  answered: boolean
  reason: 'hangup' | 'reject' | 'timeout'
  role: 'caller' | 'callee'
}): CallStatus {
  if (input.answered) return 'completed'
  if (input.reason === 'reject') return 'declined'
  if (input.reason === 'timeout') return 'missed'
  return input.role === 'caller' ? 'cancelled' : 'missed'
}

// The caller writes the row. The callee writes it only when the caller never sent hangup
// (they declined, hung up, or the caller's phone dropped). A shared client id still collapses a race.
export function shouldRecordCall(input: { role: 'caller' | 'callee'; callerSentHangup: boolean }): boolean {
  if (input.role === 'caller') return true
  return !input.callerSentHangup
}

export function isDuplicateCallInsert(error: { code?: string; message?: string }): boolean {
  if (error.code === '23505') return true
  return /duplicate key|calls_client_id/i.test(error.message ?? '')
}
