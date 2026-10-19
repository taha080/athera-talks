// Trickle ICE can arrive before the offer, and before setRemoteDescription.
// Keep those candidates until the matching call has a remote description.

export type IceQueue = Map<string, RTCIceCandidateInit[]>

export function rememberCandidate(
  queue: IceQueue,
  conversationId: string,
  candidate: RTCIceCandidateInit,
  activeConversationId: string | null,
): IceQueue {
  if (activeConversationId && activeConversationId !== conversationId) return queue
  const next = new Map(queue)
  next.set(conversationId, [...(next.get(conversationId) ?? []), candidate])
  return next
}

export function takeCandidates(
  queue: IceQueue,
  conversationId: string,
): { queue: IceQueue; candidates: RTCIceCandidateInit[] } {
  const next = new Map(queue)
  const candidates = next.get(conversationId) ?? []
  next.delete(conversationId)
  return { queue: next, candidates }
}
