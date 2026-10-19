import type { ReactNode } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { CallProvider } from '../context/CallContext'
import { ChatProvider, useChat } from '../context/ChatContext'
import { useSession } from '../context/SessionContext'
import { cn } from '../lib/cn'
import { dangerButton, iconButton } from '../lib/styles'
import { isOnline } from '../lib/presence'
import { Avatar } from './Avatar'
import { CallScreen } from './CallScreen'
import { ChatsIcon, GearIcon, SignOutIcon } from './Icons'
import { Credit } from './Credit'
import { Logo } from './Logo'
import { Sidebar } from './Sidebar'

export function Shell() {
  const location = useLocation()
  const chatOpen = location.pathname.startsWith('/c/')
  const settingsOpen = location.pathname.startsWith('/settings') || location.pathname.startsWith('/profile')
  const showList = !chatOpen && !settingsOpen

  return (
    <ChatProvider>
      <CallProvider>
        <div className="app-canvas flex h-dvh overflow-hidden text-paper">
          <NavRail />
          <aside
            className={cn(
              'min-h-0 w-full flex-col border-line bg-panel md:flex md:w-[360px] md:shrink-0 md:border-r',
              showList ? 'flex' : 'hidden',
            )}
          >
            <Sidebar />
          </aside>
          <section className={cn('min-h-0 min-w-0 flex-1 flex-col', showList ? 'hidden md:flex' : 'flex')}>
            <Outlet />
          </section>
          <CallScreen />
          <Toasts />
        </div>
      </CallProvider>
    </ChatProvider>
  )
}

function NavRail() {
  const location = useLocation()
  const navigate = useNavigate()
  const { profile, signOut } = useSession()
  const settings = location.pathname.startsWith('/settings')
  return (
    <nav aria-label="Primary" className="hidden h-full w-16 shrink-0 flex-col items-center justify-between border-r border-line bg-panel py-3 md:flex">
      <div className="flex flex-col items-center gap-1">
        <Link to="/" aria-label="Athera Talks home" className="mb-2 rounded-lg">
          <Logo className="h-9 w-9" />
        </Link>
        <RailLink to="/" label="Chats" active={!settings}>
          <ChatsIcon className="h-5 w-5" />
        </RailLink>
        <RailLink to="/settings" label="Settings" active={settings}>
          <GearIcon className="h-5 w-5" />
        </RailLink>
      </div>
      <div className="flex flex-col items-center gap-1">
        <button
          type="button"
          className={iconButton}
          aria-label="Sign out"
          onClick={() => void signOut().then(() => navigate('/login'))}
        >
          <SignOutIcon className="h-5 w-5" />
        </button>
        <Link to="/settings" aria-label="Your profile" className="rounded-full">
          <Avatar name={profile?.username ?? 'you'} url={profile?.avatarUrl} size="sm" online={isOnline(profile?.lastSeenAt)} />
        </Link>
      </div>
    </nav>
  )
}

function RailLink({
  to,
  label,
  active,
  children,
}: {
  to: string
  label: string
  active: boolean
  children: ReactNode
}) {
  return (
    <Link
      to={to}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={cn(iconButton, active ? 'bg-elevated text-paper' : '')}
    >
      {children}
    </Link>
  )
}

function Toasts() {
  const { toasts, dismissToast } = useChat()
  if (toasts.length === 0) return null
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2 px-4" aria-live="polite">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          className="toast-in pointer-events-auto rounded-lg border border-line bg-panel px-3 py-2 text-left text-sm text-paper shadow-md"
          onClick={() => dismissToast(toast.id)}
        >
          {toast.text}
        </button>
      ))}
    </div>
  )
}

export function MissingProfile() {
  const { email, signOut } = useSession()
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div className="max-w-md">
        <h1 className="text-2xl font-semibold">Profile not ready</h1>
        <p className="mt-3 text-sm leading-6 text-mist">
          Signed in as {email ?? 'your account'}. Run the database schema so a profile can be created, then refresh.
        </p>
        <button type="button" className={`${dangerButton} mt-6`} onClick={() => void signOut()}>
          Sign out
        </button>
        <Credit className="mt-6" />
      </div>
    </div>
  )
}

