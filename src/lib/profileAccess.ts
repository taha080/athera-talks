// A profile opens only for someone already in a direct chat or a shared group.
export function canViewSharedProfile({
  personId,
  meId,
  directPeerIds,
  groupMemberIds,
}: {
  personId: string
  meId: string | null | undefined
  directPeerIds: readonly string[]
  groupMemberIds: readonly string[]
}): boolean {
  if (!personId || !meId || personId === meId) return false
  return directPeerIds.includes(personId) || groupMemberIds.includes(personId)
}

// Same rule as list_my_conversations: hidden last seen stays null unless the viewer is the creator.
export function visibleLastSeen(
  lastSeenAt: string | null | undefined,
  showLastSeen: boolean | null | undefined,
  viewerIsCreator: boolean,
): string | null {
  if (!viewerIsCreator && showLastSeen === false) return null
  return lastSeenAt ?? null
}
