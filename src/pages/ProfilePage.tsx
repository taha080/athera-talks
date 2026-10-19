import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { BackIcon } from '../components/Icons'
import { Credit } from '../components/Credit'
import { ThemeSwitcher } from '../components/ThemeSwitcher'
import { useChat } from '../context/ChatContext'
import { useSession } from '../context/SessionContext'
import { usernameIssue } from '../lib/auth'
import { APP_NAME } from '../lib/brand'
import { dangerButton, fieldClass, ghostButton, primaryButton } from '../lib/styles'

const SUGGESTIONS = ['Attack on Titan', 'Demon Slayer', 'Jujutsu Kaisen', 'Frieren', 'One Piece', 'Spy x Family']

export function ProfilePage() {
  const session = useSession()
  const chat = useChat()
  const navigate = useNavigate()
  const profile = session.profile
  const [username, setUsername] = useState(profile?.username ?? '')
  const [favourite, setFavourite] = useState(profile?.favouriteAnime ?? '')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!profile) return null

  async function save(event: FormEvent) {
    event.preventDefault()
    setError('')
    setMessage('')
    const issue = usernameIssue(username)
    if (issue) {
      setError(issue)
      return
    }
    setBusy(true)
    try {
      const status = await session.usernameStatus(username)
      if (status === 'taken') {
        setError('That username is taken.')
        return
      }
      if (status === 'invalid') {
        setError(usernameIssue(username) ?? 'Choose a different username.')
        return
      }
      const anime = favourite.trim()
      await session.updateProfile({ username, favouriteAnime: anime ? anime.slice(0, 60) : null })
      setMessage('Profile saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    setError('')
    setMessage('')
    try {
      await session.uploadAvatarFile(file)
      setMessage('Avatar updated.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload that image.')
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <header className="flex items-center gap-3 border-b border-line px-3 py-3">
        <Link to="/" className="grid h-11 w-11 place-items-center rounded-full hover:bg-white/5 md:hidden" aria-label="Back to chats">
          <BackIcon className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-semibold">Profile</h1>
      </header>
      <form onSubmit={save} className="mx-auto max-w-lg space-y-6 px-5 py-8">
        <div className="flex flex-col items-center gap-3">
          <Avatar name={profile.username} url={profile.avatarUrl} size="xl" />
          <label className={`${ghostButton} cursor-pointer`}>
            Upload avatar
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="sr-only"
              onChange={(event) => void onFile(event.target.files?.[0])}
            />
          </label>
        </div>

        <label className="block text-sm">
          <span className="mb-1.5 block text-mist">Username</span>
          <input className={fieldClass} value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
        </label>

        <label className="block text-sm">
          <span className="mb-1.5 block text-mist">Email</span>
          <input className={fieldClass} value={session.email ?? ''} readOnly />
        </label>

        <div>
          <label className="block text-sm">
            <span className="mb-1.5 block text-mist">Favourite anime</span>
            <input
              className={fieldClass}
              value={favourite}
              maxLength={60}
              onChange={(event) => setFavourite(event.target.value)}
              placeholder="Frieren"
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            {SUGGESTIONS.map((title) => (
              <button
                key={title}
                type="button"
                className="rounded-full border border-line px-3 py-1 text-xs text-mist hover:text-paper"
                onClick={() => setFavourite(title)}
              >
                {title}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-line bg-elevated/60 px-4 py-4">
          <p className="text-sm font-medium">Appearance</p>
          <p className="mt-1 text-xs leading-5 text-mist">Dark is the default. Naruto uses orange, black, and leaf blue.</p>
          <ThemeSwitcher className="mt-3 justify-between" />
        </div>

        {error ? <p className="text-sm text-sakura">{error}</p> : null}
        {message ? <p className="text-sm text-foam">{message}</p> : null}

        <button type="submit" className={`${primaryButton} w-full`} disabled={busy}>
          {busy ? 'Saving…' : 'Save profile'}
        </button>

        {session.mode === 'demo' ? (
          <button
            type="button"
            className={`${ghostButton} w-full`}
            onClick={() => {
              session.resetDemo()
              void chat.refresh()
              setMessage('Demo circle restored.')
            }}
          >
            Reset demo chats
          </button>
        ) : null}

        <button
          type="button"
          className={`${dangerButton} w-full`}
          onClick={() => void session.signOut().then(() => navigate('/login'))}
        >
          Sign out
        </button>

        <p className="text-center text-sm leading-6 text-mist">
          {APP_NAME} is a small chat for anime circles.
        </p>
        <Credit />
      </form>
    </div>
  )
}
