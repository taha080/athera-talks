import { Component, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { Credit } from './components/Credit'
import { MissingProfile, Shell } from './components/Shell'
import { SetupScreen, Splash } from './components/SetupScreen'
import { SessionProvider, useSession } from './context/SessionContext'
import { routerBasename } from './lib/url'
import { AuthScreen } from './pages/AuthScreen'
import { HomePage } from './pages/HomePage'
import { ProfilePage } from './pages/ProfilePage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'

export default function App() {
  return (
    <AppErrorBoundary>
      <BrowserRouter basename={routerBasename(import.meta.env.BASE_URL)}>
        <SessionProvider>
          <Gate />
        </SessionProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  )
}

function Gate() {
  const { mode, ready } = useSession()
  if (!ready) return <Splash />
  if (mode === 'setup') return <SetupScreen />
  return (
    <Routes>
      <Route path="/login" element={<AuthScreen mode="sign-in" />} />
      <Route path="/signup" element={<AuthScreen mode="sign-up" />} />
      <Route path="/forgot-password" element={<AuthScreen mode="forgot" />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Shell />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/c/:conversationId" element={<HomePage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function RequireAuth() {
  const { profile, email } = useSession()
  if (!profile && email) return <MissingProfile />
  if (!profile) return <Navigate to="/login" replace />
  return <Outlet />
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state = { message: null as string | null }

  static getDerivedStateFromError(error: Error) {
    return { message: error.message || 'Something went wrong.' }
  }

  render() {
    if (!this.state.message) return this.props.children
    return (
      <div className="grid min-h-dvh place-items-center px-6 text-center">
        <div>
          <h1 className="text-xl font-semibold">T.A.Talk hit a snag</h1>
          <p className="mt-2 text-sm text-mist">{this.state.message}</p>
          <button type="button" className="mt-4 text-sm text-sakura" onClick={() => window.location.reload()}>
            Reload
          </button>
          <Credit className="mt-6" />
        </div>
      </div>
    )
  }
}
