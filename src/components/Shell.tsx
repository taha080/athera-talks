import { Outlet, useLocation } from 'react-router-dom'
import { CallProvider } from '../context/CallContext'
import { ChatProvider, useChat } from '../context/ChatContext'
import { useSession } from '../context/SessionContext'
import { cn } from '../lib/cn'
import { dangerButton } from '../lib/styles'
import { CallScreen } from './CallScreen'
import { Credit } from './Credit'
import { Sidebar } from './Sidebar'

export function Shell() {
  const location = useLocation()
  const chatOpen = location.pathname.startsWith('/c/')
  const settingsOpen = location.pathname.startsWith('/settings') || location.pathname.startsWith('/profile')
  const showList = !chatOpen && !settingsOpen

  return (
    <ChatProvider>
      <CallProvider>
        <div className="mx-auto flex h-dvh max-w-6xl overflow-hidden md:border-x md:border-line">
          <aside
            className={cn(
              'min-h-0 w-full flex-col md:flex md:w-[380px] md:shrink-0 md:border-r md:border-line',
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

function Toasts() {
  const { toasts, dismissToast } = useChat()
  if (toasts.length === 0) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          className="toast-in pointer-events-auto max-w-sm rounded-full bg-paper px-4 py-2 text-sm font-medium text-ink shadow-lg"
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
        <h1 className="text-2xl font-semibold">Your profile is not in the database yet.</h1>
        <p className="mt-3 text-sm leading-6 text-mist">
          Signed in as {email ?? 'your account'}. Run <code>supabase/schema.sql</code> so the signup trigger can
          create a profile, then refresh.
        </p>
        <button type="button" className={`${dangerButton} mt-6`} onClick={() => void signOut()}>
          Sign out
        </button>
        <Credit className="mt-6" />
      </div>
    </div>
  )
}

