import { useEffect, useState } from 'react'
import { useCall } from '../context/CallContext'
import { useChat } from '../context/ChatContext'
import { isGroup } from '../lib/chatList'
import { isOnline, presenceLabel } from '../lib/presence'
import { canViewSharedProfile } from '../lib/profileAccess'
import type { Profile } from '../types'
import { Avatar } from './Avatar'
import { DisplayName } from './CreatorBadge'
import { CloseIcon, PhoneIcon } from './Icons'

export type SharedProfile = {
  id: string
  username: string
  avatarUrl: string | null
  favouriteAnime: string | null
  isCreator: boolean
  lastSeenAt: string | null
}

export function ProfileSheet({
  person,
  meId,
  sourceConversationId,
  directPeerIds,
  groupMemberIds,
  onClose,
  onReport,
}: {
  person: SharedProfile
  meId: string
  sourceConversationId: string
  directPeerIds: readonly string[]
  groupMemberIds: readonly string[]
  onClose: () => void
  onReport: (person: SharedProfile) => void
}) {
  const { conversations, listBlocked, startChat, setChatPref, blockUser, unblockUser } = useChat()
  const call = useCall()
  const allowed = canViewSharedProfile({ personId: person.id, meId, directPeerIds, groupMemberIds })
  const direct = conversations.find((item) => !isGroup(item) && item.peer.id === person.id)
  const source = conversations.find((item) => item.id === sourceConversationId)
  const muted = direct ? Boolean(direct.muted) : Boolean(source?.muted)
  const [blocked, setBlocked] = useState(Boolean(direct?.blockedByMe))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  useEffect(() => {
    let cancel = false
    void listBlocked()
      .then((rows) => {
        if (!cancel && rows.some((row) => row.id === person.id)) setBlocked(true)
      })
      .catch(() => {})
    return () => {
      cancel = true
    }
  }, [listBlocked, person.id])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (document.querySelector('[aria-label^="Report @"]')) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!allowed) return null

  const presence = presenceLabel(person.lastSeenAt)
  const online = isOnline(person.lastSeenAt)
  const callsOff = blocked || Boolean(direct?.blocked)

  async function run(key: string, task: () => Promise<void>) {
    setBusy(key)
    setError('')
    try {
      await task()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not do that.')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-stretch sm:justify-end" onClick={onClose}>
      <div
        className="profile-sheet w-full max-h-[92vh] overflow-y-auto rounded-t-2xl border p-5 sm:h-full sm:max-h-none sm:w-96 sm:rounded-none sm:border-y-0 sm:border-r-0"
        role="dialog"
        aria-modal="true"
        aria-label={`@${person.username}`}
        data-profile-sheet="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex justify-end">
          <button type="button" className="profile-close grid h-8 w-8 place-items-center rounded-lg" aria-label="Close profile" onClick={onClose}>
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-col items-center text-center">
          <Avatar name={person.username} url={person.avatarUrl} size="xl" online={online} creator={person.isCreator} />
          <DisplayName name={`@${person.username}`} creator={person.isCreator} className="mt-3 text-lg font-semibold" />
          {presence ? <p className={`mt-1 text-sm ${online ? 'text-foam' : 'profile-kicker'}`}>{presence}</p> : null}
          <p className="profile-kicker mt-4 text-[11px] font-medium uppercase tracking-[0.14em]">Favourite anime</p>
          <p className="mt-1 text-sm">{person.favouriteAnime || 'Not set'}</p>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            className="profile-action inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border text-xs font-medium disabled:cursor-not-allowed disabled:opacity-45"
            aria-label="Voice call"
            disabled={callsOff || busy === 'call'}
            onClick={() =>
              void run('call', async () => {
                const conversationId = direct?.id ?? (await startChat(person.id))
                const peer: Profile = {
                  id: person.id,
                  username: person.username,
                  avatarUrl: person.avatarUrl,
                  favouriteAnime: person.favouriteAnime,
                  isCreator: person.isCreator,
                  lastSeenAt: person.lastSeenAt,
                }
                await call.startCall(peer, conversationId)
                onClose()
              })
            }
          >
            <PhoneIcon className="h-4 w-4" />
            Voice call
          </button>
          <button
            type="button"
            className="profile-action h-10 rounded-lg border text-xs font-medium disabled:cursor-not-allowed disabled:opacity-45"
            aria-label={muted ? 'Unmute' : 'Mute'}
            disabled={busy === 'mute'}
            onClick={() =>
              void run('mute', async () => {
                await setChatPref(direct?.id ?? sourceConversationId, { muted: !muted })
              })
            }
          >
            {muted ? 'Unmute' : 'Mute'}
          </button>
          <button
            type="button"
            className="profile-action h-10 rounded-lg border text-xs font-medium disabled:cursor-not-allowed disabled:opacity-45"
            aria-label={blocked ? 'Unblock' : 'Block'}
            disabled={busy === 'block'}
            onClick={() =>
              void run('block', async () => {
                if (blocked) {
                  await unblockUser(person.id)
                  setBlocked(false)
                } else {
                  await blockUser(person.id)
                  setBlocked(true)
                }
              })
            }
          >
            {blocked ? 'Unblock' : 'Block'}
          </button>
          <button
            type="button"
            className="profile-action h-10 rounded-lg border text-xs font-medium"
            aria-label="Report"
            onClick={() => onReport(person)}
          >
            Report
          </button>
        </div>
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      </div>
    </div>
  )
}
