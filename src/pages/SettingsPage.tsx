import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { DisplayName, OfficialCreatorCard } from '../components/CreatorBadge'
import { Credit } from '../components/Credit'
import { BackIcon } from '../components/Icons'
import { useChat } from '../context/ChatContext'
import { useSession } from '../context/SessionContext'
import { useTheme } from '../context/ThemeContext'
import { usernameIssue } from '../lib/auth'
import { hasPremium } from '../lib/premium'
import {
  THEME_CHOICES,
  THEME_GROUPS,
  WALLPAPER_CHOICES,
  pairedWallpaper,
  parseWallpaper,
  wallpaperClass,
  type WallpaperName,
} from '../lib/appearance'
import { cn } from '../lib/cn'
import { type ThemeName } from '../lib/theme'
import { grantPremium, revokePremium } from '../services/liveBackend'
import { dangerButton, fieldClass, ghostButton, primaryButton } from '../lib/styles'
import type { BlockedPerson, UserReport } from '../types'
import { formatListTime } from '../lib/format'

const SUGGESTIONS = ['Attack on Titan', 'Demon Slayer', 'Jujutsu Kaisen', 'Frieren', 'One Piece', 'Spy x Family']
const SECTIONS = [
  { id: 'profile', label: 'Profile' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'privacy', label: 'Privacy' },
] as const

type Section = (typeof SECTIONS)[number]['id']

export function SettingsPage() {
  const { section } = useParams()
  const { profile } = useSession()
  const sections = profile?.isCreator
    ? [...SECTIONS, { id: 'reports' as const, label: 'Reports' }, { id: 'premium' as const, label: 'Admin premium' }]
    : SECTIONS
  const current: Section | 'reports' | 'premium' =
    section === 'appearance' || section === 'privacy' || ((section === 'reports' || section === 'premium') && profile?.isCreator) ? section : 'profile'
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-14 items-center gap-2 border-b border-line bg-panel px-2">
        <Link to="/" className="grid h-10 w-10 place-items-center rounded-lg hover:bg-white/8 md:hidden" aria-label="Back to chats">
          <BackIcon className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-semibold">Settings</h1>
      </header>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav className="flex gap-1 overflow-x-auto border-b border-line px-3 py-3 md:w-48 md:flex-col md:border-b-0 md:border-r" aria-label="Settings">
          {sections.map((item) => (
            <Link
              key={item.id}
              to={item.id === 'profile' ? '/settings' : `/settings/${item.id}`}
              className={cn(
                'rounded-lg px-3 py-2 text-sm font-medium transition',
                current === item.id ? 'bg-white/10 text-paper' : 'text-mist hover:text-paper',
              )}
              aria-current={current === item.id ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {current === 'profile' ? <ProfileSection /> : null}
          {current === 'appearance' ? <AppearanceSection /> : null}
          {current === 'privacy' ? <PrivacySection /> : null}
          {current === 'reports' ? <ReportsSection /> : null}
          {current === 'premium' ? <PremiumSection /> : null}
        </div>
      </div>
    </div>
  )
}

function ProfileSection() {
  const session = useSession()
  const chat = useChat()
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
    <form onSubmit={save} className="mx-auto max-w-lg space-y-6 px-5 py-8">
      <div className="flex flex-col items-center gap-3">
        <Avatar name={profile.username} url={profile.avatarUrl} size="xl" creator={profile.isCreator} premium={hasPremium(profile)} />
        <DisplayName name={`@${profile.username}`} creator={profile.isCreator} premium={hasPremium(profile)} className="text-base font-semibold" />
        {profile.isCreator ? <OfficialCreatorCard /> : null}
        <label className={`${ghostButton} cursor-pointer`}>
          Upload avatar
          <input
            type="file"
            accept={profile.isCreator || hasPremium(profile) ? 'image/png,image/jpeg,image/webp,image/gif' : 'image/png,image/jpeg,image/webp'}
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
          <input className={fieldClass} value={favourite} maxLength={60} onChange={(event) => setFavourite(event.target.value)} placeholder="Frieren" />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((title) => (
            <button key={title} type="button" className="rounded-full border border-line px-3 py-1 text-xs text-mist hover:text-paper" onClick={() => setFavourite(title)}>
              {title}
            </button>
          ))}
        </div>
      </div>
      {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
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
            setMessage('Demo chats restored.')
          }}
        >
          Reset demo chats
        </button>
      ) : null}
      <p className="text-center text-sm leading-6 text-mist">Messages stay between you and the people you write to.</p>
      <Credit />
    </form>
  )
}

function AppearanceSection() {
  const session = useSession()
  const { theme, setTheme } = useTheme()
  const profile = session.profile
  const savedWallpaper = parseWallpaper(profile?.wallpaper)
  const [pendingWallpaper, setPendingWallpaper] = useState<WallpaperName | null>(null)
  const wallpaper = pendingWallpaper ?? savedWallpaper
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function chooseTheme(next: ThemeName) {
    const previous = theme
    const pair = pairedWallpaper(next)
    setTheme(next)
    if (pair) setPendingWallpaper(pair)
    setError('')
    try {
      await session.saveAppearance(pair ? { theme: next, wallpaper: pair } : { theme: next })
      const label = THEME_CHOICES.find((item) => item.id === next)?.label ?? 'Theme'
      setMessage(pair ? `${label} and its wallpaper are saved on this account.` : `${label} saved on this account.`)
    } catch (err) {
      setTheme(previous)
      setError(err instanceof Error ? err.message : 'Could not save that theme.')
    } finally {
      setPendingWallpaper(null)
    }
  }

  async function chooseWallpaper(next: WallpaperName) {
    setError('')
    try {
      await session.saveAppearance({ wallpaper: next })
      setMessage('Wallpaper saved on this account.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that wallpaper.')
    }
  }

  async function onWallpaper(file: File | undefined) {
    if (!file) return
    setError('')
    try {
      await session.uploadWallpaperFile(file)
      setMessage('Your photo wallpaper is saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload that wallpaper.')
    }
  }

  const preview = wallpaper === 'custom' && profile?.wallpaperUrl ? profile.wallpaperUrl.replace(/"/g, '') : ''

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-5 py-8">
      <div
        className={cn('h-48 overflow-hidden rounded-3xl border border-line', wallpaperClass(wallpaper))}
        style={preview ? { backgroundImage: `url("${preview}")` } : undefined}
      >
        <div className="flex h-full flex-col justify-end gap-2 p-4">
          <div className="bubble-other max-w-[70%] rounded-2xl bg-elevated px-3 py-2 text-sm">This is the live preview.</div>
          <div className="bubble-own ml-auto max-w-[70%] rounded-2xl px-3 py-2 text-sm">Looks good.</div>
        </div>
      </div>
      <div className="space-y-5">
        <p className="text-sm font-medium">Theme</p>
        {THEME_GROUPS.map((group) => (
          <section key={group.id} aria-label={group.label}>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-mist">{group.label}</h2>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {group.themes.map((choice) => {
                const sample = pairedWallpaper(choice.id) ?? 'plain'
                return (
                  <button
                    key={choice.id}
                    type="button"
                    aria-pressed={theme === choice.id}
                    onClick={() => void chooseTheme(choice.id)}
                    className={cn('rounded-lg border px-3 py-3 text-left text-sm transition hover:bg-white/5', theme === choice.id ? 'border-sakura ring-2 ring-sakura/30' : 'border-line')}
                  >
                    <span
                      data-theme={choice.id}
                      className={cn('mb-2 block h-14 overflow-hidden rounded-xl border border-line', wallpaperClass(sample))}
                    >
                      <span className="mx-2 mt-7 block h-2 rounded-full" style={{ background: choice.swatch }} />
                    </span>
                    {choice.label}
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>
      <div>
        <p className="text-sm font-medium">Wallpaper</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {WALLPAPER_CHOICES.map((choice) => (
            <button
              key={choice.id}
              type="button"
              aria-pressed={wallpaper === choice.id}
              onClick={() => void chooseWallpaper(choice.id)}
              className={cn('overflow-hidden rounded-2xl border text-left', wallpaper === choice.id ? 'border-sakura' : 'border-line')}
            >
              <span className={cn('block h-14', wallpaperClass(choice.id))} />
              <span className="block px-2 py-1.5 text-xs">{choice.label}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <label className={`${ghostButton} cursor-pointer`}>
            Upload photo
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => void onWallpaper(event.target.files?.[0])} />
          </label>
          {wallpaper === 'custom' ? (
            <button type="button" className={ghostButton} onClick={() => void session.removeWallpaper().then(() => setMessage('Wallpaper removed.')).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not remove it.'))}>
              Remove photo
            </button>
          ) : null}
        </div>
      </div>
      {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
      {message ? <p className="text-sm text-foam">{message}</p> : null}
      <p className="text-xs leading-5 text-mist">Themes and wallpapers are original colours and patterns. They stay with your profile on every device.</p>
    </div>
  )
}

function PrivacySection() {
  const session = useSession()
  const chat = useChat()
  const navigate = useNavigate()
  const profile = session.profile
  const [error, setError] = useState('')
  const [blocked, setBlocked] = useState<BlockedPerson[]>([])
  useEffect(() => {
    let cancel = false
    void chat.listBlocked().then((rows) => {
      if (!cancel) setBlocked(rows)
    }).catch(() => {
      if (!cancel) setBlocked([])
    })
    return () => {
      cancel = true
    }
  }, [chat])
  if (!profile) return null

  async function unblock(userId: string) {
    setError('')
    try {
      await chat.unblockUser(userId)
      setBlocked((current) => current.filter((person) => person.id !== userId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unblock that person.')
    }
  }

  async function toggle(patch: Parameters<typeof session.saveAppearance>[0]) {
    setError('')
    try {
      await session.saveAppearance(patch)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that setting.')
    }
  }

  async function allowDesktop() {
    if (typeof Notification === 'undefined') {
      setError('This browser does not show desktop alerts.')
      return
    }
    const result = await Notification.requestPermission()
    if (result !== 'granted') {
      setError('Desktop alerts stay off until the browser allows them.')
      return
    }
    await toggle({ notifyDesktop: true })
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 px-5 py-8">
      <Toggle
        label="Last seen"
        detail="People you chat with can see when you were last here."
        checked={profile.showLastSeen !== false}
        onChange={(checked) => void toggle({ showLastSeen: checked })}
      />
      <Toggle
        label="Read receipts"
        detail="Ticks show when your messages are delivered and seen."
        checked={profile.showReadReceipts !== false}
        onChange={(checked) => void toggle({ showReadReceipts: checked })}
      />
      <p className="px-1 text-xs leading-5 text-mist">
        Note: the app creator (Taha Ahsan) can always see last seen and read receipts.
      </p>
      <section className="rounded-lg border border-line px-4 py-3">
        <h2 className="text-sm font-medium">Blocked</h2>
        <p className="mt-1 text-xs leading-5 text-mist">Blocked people cannot message or call you, and you cannot message or call them.</p>
        {blocked.length === 0 ? <p className="mt-3 text-sm text-mist">You have not blocked anyone.</p> : null}
        <ul className="mt-3 space-y-2">
          {blocked.map((person) => (
            <li key={person.id} className="flex items-center gap-3">
              <Avatar name={person.username} url={person.avatarUrl} size="sm" creator={person.isCreator} premium={hasPremium(person)} />
              <DisplayName name={person.username} creator={person.isCreator} premium={hasPremium(person)} className="min-w-0 flex-1 text-sm" />
              <button type="button" className={ghostButton} onClick={() => void unblock(person.id)}>
                Unblock
              </button>
            </li>
          ))}
        </ul>
      </section>
      <Toggle
        label="Message sound"
        detail="A short chime plays with each message pop-up."
        checked={profile.notifySound !== false}
        onChange={(checked) => void toggle({ notifySound: checked })}
      />
      <Toggle
        label="Desktop alerts"
        detail="Show a browser notification when a chat is in the background."
        checked={profile.notifyDesktop !== false}
        onChange={(checked) => void toggle({ notifyDesktop: checked })}
      />
      <button type="button" className={`${ghostButton} w-full`} onClick={() => void allowDesktop()}>
        Allow desktop alerts
      </button>
      {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
      <button type="button" className={`${dangerButton} w-full`} onClick={() => void session.signOut().then(() => navigate('/login'))}>
        Sign out
      </button>
    </div>
  )
}

function PremiumSection() {
  const session = useSession()
  const profile = session.profile
  const [username, setUsername] = useState('')
  const [days, setDays] = useState(30)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (!profile?.isCreator) return null
  const live = session.mode === 'live'

  async function grant(event: FormEvent) {
    event.preventDefault()
    setError('')
    setMessage('')
    if (!live) {
      setError('Premium grants need the live Supabase connection. This demo cannot grant Premium.')
      return
    }
    setBusy(true)
    try {
      const until = await grantPremium(username, days)
      const name = username.trim().replace(/^@+/, '')
      setMessage(`Premium granted to @${name} until ${new Date(until).toLocaleString()}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not grant Premium.')
    } finally {
      setBusy(false)
    }
  }

  async function revoke() {
    setError('')
    setMessage('')
    if (!live) {
      setError('Premium grants need the live Supabase connection. This demo cannot revoke Premium.')
      return
    }
    setBusy(true)
    try {
      await revokePremium(username)
      const name = username.trim().replace(/^@+/, '')
      setMessage(`Premium removed from @${name}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke Premium.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={grant} className="mx-auto max-w-lg space-y-4 px-5 py-8">
      <h2 className="text-sm font-semibold">Admin premium</h2>
      <p className="text-xs leading-5 text-mist">
        Only the creator can use this. Premium gives the verified tick, gold ring, animated GIF avatar and premium chat bubble until the date shown.
      </p>
      {!live ? <p className="text-sm text-mist">Demo mode: connect the live Supabase project first, and apply supabase/migrations/20261024130000_grant_premium_by_creator.sql in Supabase.</p> : null}
      <label className="block text-sm">
        <span className="mb-1.5 block text-mist">Username</span>
        <input className={fieldClass} value={username} onChange={(event) => setUsername(event.target.value)} placeholder="sakura" autoComplete="username" />
      </label>
      <div>
        <span className="mb-1.5 block text-sm text-mist">Days</span>
        <div className="flex flex-wrap gap-2">
          {[7, 30, 90].map((preset) => (
            <button key={preset} type="button" className={days === preset ? primaryButton : ghostButton} onClick={() => setDays(preset)}>
              {preset} days
            </button>
          ))}
          <input
            className={`${fieldClass} w-28`}
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            aria-label="Custom days"
          />
        </div>
      </div>
      {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
      {message ? <p className="text-sm text-foam">{message}</p> : null}
      <button type="submit" className={`${primaryButton} w-full`} disabled={busy || !live}>
        {busy ? 'Granting…' : 'Grant Premium'}
      </button>
      <button type="button" className={`${dangerButton} w-full`} disabled={busy || !live} onClick={() => void revoke()}>
        Revoke Premium
      </button>
    </form>
  )
}

function ReportsSection() {
  const chat = useChat()
  const [reports, setReports] = useState<UserReport[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    let cancel = false
    void chat.listReports()
      .then((rows) => {
        if (!cancel) setReports(rows)
      })
      .catch((err: unknown) => {
        if (!cancel) setError(err instanceof Error ? err.message : 'Could not load reports.')
      })
    return () => {
      cancel = true
    }
  }, [chat])

  return (
    <div className="mx-auto max-w-lg space-y-3 px-5 py-8">
      <h2 className="text-sm font-semibold">Reports</h2>
      <p className="text-xs leading-5 text-mist">Only the creator account can read these.</p>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {reports.length === 0 && !error ? <p className="text-sm text-mist">No reports yet.</p> : null}
      <ul className="space-y-2">
        {reports.map((report) => (
          <li key={report.id} className="rounded-lg border border-line px-4 py-3 text-sm">
            <p className="font-medium">{report.reason}</p>
            <p className="mt-1 text-mist">
              @{report.reporterUsername} reported @{report.reportedUsername}
            </p>
            {report.details ? <p className="mt-2 whitespace-pre-wrap">{report.details}</p> : null}
            <p className="mt-2 text-xs text-mist">{formatListTime(report.createdAt)}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Toggle({
  label,
  detail,
  checked,
  onChange,
}: {
  label: string
  detail: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button type="button" className="flex w-full items-center gap-4 rounded-lg border border-line px-4 py-3 text-left transition hover:bg-white/5" onClick={() => onChange(!checked)} aria-pressed={checked}>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-mist">{detail}</span>
      </span>
      <span className={cn('h-7 w-12 rounded-full p-1 transition', checked ? 'bg-sakura' : 'bg-white/10')}>
        <span className={cn('block h-5 w-5 rounded-full bg-white transition', checked ? 'translate-x-5' : '')} />
      </span>
    </button>
  )
}
