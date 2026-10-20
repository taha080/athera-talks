import { useState } from 'react'
import { AVATAR_BYTES } from '../lib/avatarFile'
import { hasPremium } from '../lib/premium'
import { squareAvatar } from '../lib/image'
import { fieldClass, ghostButton } from '../lib/styles'
import type { Conversation, GroupMember, Profile } from '../types'
import { Avatar } from './Avatar'
import { DisplayName } from './CreatorBadge'
import { CloseIcon } from './Icons'

export function GroupPanel({
  conversation,
  meId,
  members,
  contacts,
  onClose,
  onRename,
  onPhoto,
  onAdd,
  onRemove,
  onRole,
  onLeave,
  onDelete,
  onOpenProfile,
}: {
  conversation: Conversation
  meId: string
  members: GroupMember[]
  contacts: Profile[]
  onClose: () => void
  onRename: (title: string) => Promise<void>
  onPhoto: (file: Blob) => Promise<void>
  onAdd: (userId: string) => Promise<void>
  onRemove: (userId: string) => Promise<void>
  onRole: (userId: string, role: 'admin' | 'member') => Promise<void>
  onLeave: () => Promise<void>
  onDelete: () => Promise<void>
  onOpenProfile: (member: GroupMember) => void
}) {
  const admin = conversation.myRole === 'admin'
  const [title, setTitle] = useState(conversation.title ?? '')
  const [error, setError] = useState('')
  const available = contacts.filter((person) => !members.some((member) => member.id === person.id))

  async function run(task: Promise<void>) {
    setError('')
    try {
      await task
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the group.')
    }
  }

  return (
    <div className="absolute right-2 top-14 z-20 w-80 max-w-[calc(100vw-1.5rem)] rounded-xl border border-line bg-panel p-3 text-left shadow-md" role="dialog" aria-label="Group details">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{conversation.title || 'Group'}</p>
          <p className="mt-1 text-xs text-mist">{members.length} members</p>
        </div>
        <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-mist hover:text-paper" aria-label="Close details" onClick={onClose}>
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
      {admin ? (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void run(onRename(title))
          }}
        >
          <input className={fieldClass} value={title} maxLength={80} aria-label="Group name" onChange={(event) => setTitle(event.target.value)} />
          <button type="submit" className={ghostButton}>
            Save
          </button>
        </form>
      ) : null}
      {admin ? (
        <label className={`${ghostButton} mt-2 w-full cursor-pointer`}>
          Change photo
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (!file) return
              void run(
                (async () => {
                  if (file.size > AVATAR_BYTES) throw new Error('Choose an image under 30 MB.')
                  await onPhoto(await squareAvatar(file))
                })(),
              )
            }}
          />
        </label>
      ) : null}
      {admin && available.length > 0 ? (
        <label className="mt-3 block text-xs font-medium text-mist">
          Add member
          <select
            className={`${fieldClass} mt-1`}
            defaultValue=""
            aria-label="Add member"
            onChange={(event) => {
              const id = event.target.value
              event.target.value = ''
              if (id) void run(onAdd(id))
            }}
          >
            <option value="">Choose a contact</option>
            {available.map((person) => (
              <option key={person.id} value={person.id}>
                {person.username}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
        {members.map((member) => (
          <li key={member.id} className="flex items-center gap-2">
            {member.id === meId ? (
              <>
                <Avatar name={member.username} url={member.avatarUrl} size="sm" creator={member.isCreator} premium={hasPremium(member)} />
                <span className="min-w-0 flex-1">
                  <DisplayName name={member.username} creator={member.isCreator} premium={hasPremium(member)} className="text-sm" />
                  <span className="block text-[11px] text-mist">{member.role === 'admin' ? 'Admin' : 'Member'}</span>
                </span>
              </>
            ) : (
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                aria-label={`View @${member.username}`}
                onClick={() => onOpenProfile(member)}
              >
                <Avatar name={member.username} url={member.avatarUrl} size="sm" creator={member.isCreator} premium={hasPremium(member)} />
                <span className="min-w-0 flex-1">
                  <DisplayName name={member.username} creator={member.isCreator} premium={hasPremium(member)} className="text-sm" />
                  <span className="block text-[11px] text-mist">{member.role === 'admin' ? 'Admin' : 'Member'}</span>
                </span>
              </button>
            )}
            {admin && member.id !== meId ? (
              <span className="flex shrink-0 gap-1">
                <button
                  type="button"
                  className="rounded-md px-1.5 py-1 text-[11px] text-mist hover:text-paper"
                  onClick={() => void run(onRole(member.id, member.role === 'admin' ? 'member' : 'admin'))}
                >
                  {member.role === 'admin' ? 'Dismiss' : 'Make admin'}
                </button>
                <button type="button" className="rounded-md px-1.5 py-1 text-[11px] text-danger" onClick={() => void run(onRemove(member.id))}>
                  Remove
                </button>
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      <div className="mt-3 flex gap-2">
        <button type="button" className={`${ghostButton} flex-1`} onClick={() => void run(onLeave())}>
          Leave
        </button>
        {admin ? (
          <button type="button" className="flex-1 rounded-lg bg-[#f07167]/15 px-3 py-2 text-sm font-medium text-danger" onClick={() => void run(onDelete())}>
            Delete group
          </button>
        ) : null}
      </div>
    </div>
  )
}
