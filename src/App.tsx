import { Component, useEffect, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { Credit } from './components/Credit'
import { MissingProfile, Shell } from './components/Shell'
import { SetupScreen, Splash } from './components/SetupScreen'
import { SessionProvider, useSession } from './context/SessionContext'
import { ThemeProvider, useTheme } from './context/ThemeContext'
import { APP_NAME } from './lib/brand'
import { accountTheme } from './lib/theme'
import { routerBasename } from './lib/url'
import { AuthScreen } from './pages/AuthScreen'
import { HomePage } from './pages/HomePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { SettingsPage } from './pages/SettingsPage'

export default function App() {
  return (
    <AppErrorBoundary>
      <ThemeProvider>
        <BrowserRouter basename={routerBasename(import.meta.env.BASE_URL)}>
          <SessionProvider>
            <ThemeSync />
            <Gate />
          </SessionProvider>
        </BrowserRouter>
      </ThemeProvider>
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
          <Route path="/profile" element={<Navigate to="/settings" replace />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/:section" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

function ThemeSync() {
  const { profile } = useSession()
  const { setTheme } = useTheme()
  useEffect(() => {
    if (!profile) return
    setTheme(accountTheme(profile.theme))
  }, [profile, setTheme])
  return null
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
          <h1 className="text-xl font-semibold">{APP_NAME} hit a snag</h1>
          <p className="mt-2 max-w-sm text-sm text-mist">{this.state.message}</p>
          <button type="button" className="mt-4 rounded-lg bg-sakura px-4 py-2 text-sm font-semibold text-white" onClick={() => window.location.reload()}>
            Reload
          </button>
          <Credit className="mt-6" />
        </div>
      </div>
    )
  }
}
