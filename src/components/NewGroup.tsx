import { useState } from 'react'
import { fieldClass, ghostButton, primaryButton } from '../lib/styles'
import type { Profile } from '../types'
import { Avatar } from './Avatar'
import { DisplayName } from './CreatorBadge'
import { BackIcon } from './Icons'

export function NewGroup({
  contacts,
  onClose,
  onCreate,
}: {
  contacts: Profile[]
  onClose: () => void
  onCreate: (title: string, memberIds: string[]) => Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function toggle(id: string) {
    setPicked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }

  async function create() {
    setBusy(true)
    setError('')
    try {
      await onCreate(title, picked)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the group.')
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 px-2 py-2">
        <button type="button" className="grid h-10 w-10 place-items-center rounded-lg text-mist hover:text-paper" aria-label="Back to chats" onClick={onClose}>
          <BackIcon className="h-5 w-5" />
        </button>
        <h2 className="text-sm font-semibold">New group</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <label className="block text-xs font-medium text-mist">
          Group name
          <input className={`${fieldClass} mt-1`} value={title} maxLength={80} placeholder="Night watch" onChange={(event) => setTitle(event.target.value)} />
        </label>
        <p className="mt-4 text-xs font-medium text-mist">Members</p>
        {contacts.length === 0 ? <p className="mt-2 text-sm text-mist">Add a contact before starting a group.</p> : null}
        <ul className="mt-2">
          {contacts.map((person) => {
            const on = picked.includes(person.id)
            return (
              <li key={person.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-lg px-1 py-2 text-left hover:bg-white/5"
                  aria-pressed={on}
                  onClick={() => toggle(person.id)}
                >
                  <Avatar name={person.username} url={person.avatarUrl} size="sm" creator={person.isCreator} />
                  <DisplayName name={person.username} creator={person.isCreator} className="min-w-0 flex-1 text-sm" />
                  <span className={`grid h-5 w-5 place-items-center rounded-md border text-[11px] ${on ? 'border-sakura bg-sakura text-white' : 'border-line text-transparent'}`}>✓</span>
                </button>
              </li>
            )
          })}
        </ul>
        {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
        <div className="mt-4 flex gap-2">
          <button type="button" className={ghostButton} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={primaryButton} disabled={busy || picked.length === 0 || !title.trim()} onClick={() => void create()}>
            Create group
          </button>
        </div>
      </div>
    </div>
  )
}
