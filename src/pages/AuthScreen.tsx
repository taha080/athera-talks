import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { Credit } from '../components/Credit'
import { Glow } from '../components/SetupScreen'
import { KunaiMark } from '../components/KunaiMark'
import { NightShell } from '../components/NightVillage'
import { ThemeSwitcher } from '../components/ThemeSwitcher'
import { GoogleIcon } from '../components/Icons'
import { useSession } from '../context/SessionContext'
import { APP_NAME } from '../lib/brand'
import { useTheme } from '../context/ThemeContext'
import { isValidEmail, normalizeUsername, passwordIssue, usernameIssue } from '../lib/auth'
import { cn } from '../lib/cn'
import { fieldClass, primaryButton } from '../lib/styles'
import { DEMO_EMAIL, DEMO_PASSWORD } from '../demo/seed'

type AuthMode = 'sign-in' | 'sign-up' | 'forgot'

export function AuthScreen({ mode }: { mode: AuthMode }) {
  const session = useSession()
  const { theme } = useTheme()
  const navigate = useNavigate()
  const [email, setEmail] = useState(session.mode === 'demo' ? DEMO_EMAIL : '')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [username, setUsername] = useState('')
  const [nameNote, setNameNote] = useState('')
  const [nameTone, setNameTone] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (mode !== 'sign-up') return
    const issue = username.trim() ? usernameIssue(username) : null
    if (!username.trim()) {
      setNameTone('idle')
      setNameNote('')
      return
    }
    if (issue) {
      setNameTone('invalid')
      setNameNote(issue)
      return
    }
    setNameTone('checking')
    setNameNote('Checking username…')
    let cancelled = false
    const timer = window.setTimeout(() => {
      void session.usernameStatus(username).then((status) => {
        if (cancelled) return
        if (status === 'available') {
          setNameTone('available')
          setNameNote(`@${normalizeUsername(username)} is available`)
        } else if (status === 'taken') {
          setNameTone('taken')
          setNameNote('That username is taken')
        } else {
          setNameTone('invalid')
          setNameNote(usernameIssue(username) ?? 'Choose a different username.')
        }
      }).catch((err: unknown) => {
        if (cancelled) return
        setNameTone('invalid')
        setNameNote(err instanceof Error ? err.message : 'Could not check that username.')
      })
    }, 350)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [mode, session, username])

  if (session.profile && !session.recovery) return <Navigate to="/" replace />

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setInfo('')
    if (mode !== 'forgot' && !isValidEmail(email)) {
      setError('Enter a valid email address.')
      return
    }
    if (mode === 'forgot') {
      if (!isValidEmail(email)) {
        setError('Enter the email on your account.')
        return
      }
      setBusy(true)
      try {
        const result = await session.sendPasswordReset(email)
        if (result.demoReset) {
          navigate('/reset-password')
          return
        }
        setInfo('If that email has an account, a reset link is on its way.')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not send the reset email.')
      } finally {
        setBusy(false)
      }
      return
    }

    const passError = passwordIssue(password)
    if (passError) {
      setError(passError)
      return
    }
    if (mode === 'sign-up' && theme === 'naruto' && password !== confirm) {
      setError('Those passwords do not match.')
      return
    }

    if (mode === 'sign-up') {
      const issue = usernameIssue(username)
      if (issue) {
        setError(issue)
        return
      }
      setBusy(true)
      try {
        const status = await session.usernameStatus(username)
        if (status !== 'available') {
          setError(status === 'taken' ? 'That username is taken.' : 'Choose a different username.')
          return
        }
        await session.signUp({ email, password, username })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not create the account.')
      } finally {
        setBusy(false)
      }
      return
    }

    setBusy(true)
    try {
      await session.signIn(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.')
    } finally {
      setBusy(false)
    }
  }

  async function onGoogle() {
    setError('')
    setBusy(true)
    try {
      await session.signInWithGoogle()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed.')
    } finally {
      setBusy(false)
    }
  }

  const googleOff = session.google === 'disabled'
  const night = theme === 'naruto'

  if (night) {
    return (
      <NightShell>
        <div className="night-card w-full max-w-md rounded-2xl px-6 py-7 sm:px-8">
          <div className="text-center">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-[#ff8a1a]/80 bg-[#0c1830] text-[#ff9a2e] shadow-[0_0_28px_rgba(255,138,26,0.3)]">
              <KunaiMark className="h-8 w-8" />
            </span>
            <p className="font-display mt-3 text-4xl font-semibold text-white">{APP_NAME}</p>
            <p className="mt-1 text-sm text-[#c5d4e6]">
              <span className="text-[#ff8a1a]">◆</span> Speak freely. Connect deeply.{' '}
              <span className="text-[#ff8a1a]">◆</span>
            </p>
          </div>

          {mode === 'forgot' ? (
            <h2 className="mt-6 text-center text-lg font-semibold">Reset your password</h2>
          ) : (
            <div className="mt-6 grid grid-cols-2 text-sm">
              <Tab to="/login" active={mode === 'sign-in'} night>
                Sign in
              </Tab>
              <Tab to="/signup" active={mode === 'sign-up'} night>
                Sign up
              </Tab>
            </div>
          )}

          <form onSubmit={onSubmit} className="mt-5 space-y-3">
            {mode === 'sign-up' ? (
              <label className="block">
                <span className="relative block">
                  <FieldIcon>
                    <UserGlyph />
                  </FieldIcon>
                  <input
                    className="night-field"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    autoComplete="username"
                    placeholder="Username"
                    required
                  />
                </span>
                {nameNote ? (
                  <span
                    className={cn(
                      'mt-1.5 block text-xs',
                      nameTone === 'available' && 'text-foam',
                      (nameTone === 'taken' || nameTone === 'invalid') && 'text-[#ff8a1a]',
                      nameTone === 'checking' && 'text-[#8ea4bf]',
                    )}
                  >
                    {nameNote}
                  </span>
                ) : null}
              </label>
            ) : null}

            <label className="relative block">
              <FieldIcon>
                <MailGlyph />
              </FieldIcon>
              <input
                className="night-field"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                placeholder="Email address"
                required
              />
            </label>

            {mode !== 'forgot' ? (
              <label className="relative block">
                <FieldIcon>
                  <LockGlyph />
                </FieldIcon>
                <input
                  className="night-field pr-12"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                  placeholder="Password"
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8ea4bf]"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <EyeGlyph off={showPassword} />
                </button>
              </label>
            ) : null}

            {mode === 'sign-up' ? (
              <label className="relative block">
                <FieldIcon>
                  <LockGlyph />
                </FieldIcon>
                <input
                  className="night-field pr-12"
                  type={showConfirm ? 'text' : 'password'}
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  autoComplete="new-password"
                  placeholder="Confirm password"
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8ea4bf]"
                  onClick={() => setShowConfirm((value) => !value)}
                  aria-label={showConfirm ? 'Hide confirmation' : 'Show confirmation'}
                >
                  <EyeGlyph off={showConfirm} />
                </button>
              </label>
            ) : null}

            {mode === 'sign-in' ? (
              <div className="text-right">
                <Link to="/forgot-password" className="text-xs font-medium text-[#ff8a1a] hover:underline">
                  Forgot password?
                </Link>
              </div>
            ) : null}

            {error ? <p className="rounded-lg bg-[#ff8a1a]/10 px-3 py-2 text-sm text-[#ffb15a]">{error}</p> : null}
            {info ? <p className="rounded-lg bg-foam/10 px-3 py-2 text-sm text-foam">{info}</p> : null}

            <button
              type="submit"
              className="night-button"
              disabled={busy || (mode === 'sign-up' && nameTone === 'taken')}
            >
              <KunaiMark className="h-4 w-4 text-[#ff8a1a]" />
              {busy ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : mode === 'sign-up' ? 'Create account' : 'Send reset email'}
            </button>
          </form>

          {mode !== 'forgot' ? (
            <>
              <div className="my-4 flex items-center gap-3 text-xs text-[#8ea4bf]">
                <span className="h-px flex-1 bg-white/15" />
                or continue with
                <span className="h-px flex-1 bg-white/15" />
              </div>
              <div className="flex justify-center">
                <button
                  type="button"
                  className="grid h-12 w-12 place-items-center rounded-xl border border-[#3d6d99] bg-[#0c1b33] disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={onGoogle}
                  disabled={googleOff || busy}
                  aria-label="Continue with Google"
                >
                  <GoogleIcon className="h-5 w-5" />
                </button>
              </div>
              {googleOff ? (
                <p className="mt-2 text-center text-xs leading-5 text-[#8ea4bf]">
                  Google sign-in is not enabled yet. Use email, or set VITE_SUPABASE_GOOGLE_ENABLED=true.
                </p>
              ) : session.mode === 'demo' ? (
                <p className="mt-2 text-center text-xs text-[#8ea4bf]">Demo Google account signs in as Taha.</p>
              ) : null}
              <p className="mt-4 text-center text-sm text-[#b7c7da]">
                {mode === 'sign-up' ? (
                  <>
                    Already have an account?{' '}
                    <Link to="/login" className="font-semibold text-[#ff8a1a]">
                      Sign in
                    </Link>
                  </>
                ) : (
                  <>
                    New here?{' '}
                    <Link to="/signup" className="font-semibold text-[#ff8a1a]">
                      Sign up
                    </Link>
                  </>
                )}
              </p>
            </>
          ) : (
            <Link to="/login" className="mt-4 block text-center text-sm text-[#b7c7da] hover:text-white">
              Back to sign in
            </Link>
          )}

          {session.mode === 'demo' ? (
            <p className="mt-4 text-center text-xs leading-5 text-[#8ea4bf]">
              Demo fan {DEMO_EMAIL} · password {DEMO_PASSWORD}
            </p>
          ) : null}
          {session.mode === 'demo' ? (
            <button type="button" className="mt-2 w-full text-center text-xs text-[#8ea4bf] hover:text-white" onClick={session.leaveDemo}>
              Back to setup
            </button>
          ) : null}
          <Credit className="mt-4" />
        </div>
      </NightShell>
    )
  }

  return (
    <div className="relative min-h-dvh">
      <Glow />
      <div className="mx-auto grid min-h-dvh max-w-6xl items-center gap-10 overflow-y-auto px-4 py-8 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
        <section className="max-w-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Brand large />
            <ThemeSwitcher />
          </div>
          <h1 className="mt-8 text-4xl font-semibold tracking-tight sm:text-5xl">
            Chat and call your anime circle.
          </h1>
          <p className="mt-4 max-w-md text-base leading-7 text-mist">
            A quiet little room for people who pause the episode. Messages, voice, and a favourite anime on your profile.
          </p>
          <ul className="mt-8 hidden gap-3 text-sm sm:grid">
            {['Real-time one-to-one chat', 'Browser voice calls', 'Username, avatar, favourite anime'].map((item) => (
              <li key={item} className="flex items-center gap-3">
                <span className="h-2 w-2 rounded-full bg-gradient-to-r from-sakura to-violet" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-[2rem] border border-line bg-panel/90 p-6 shadow-2xl shadow-black/40 sm:p-8">
          {mode === 'forgot' ? (
            <div>
              <h2 className="text-2xl font-semibold">Reset your password</h2>
              <p className="mt-2 text-sm leading-6 text-mist">
                {session.mode === 'demo'
                  ? 'Demo mode has no inbox. If the email matches a demo fan, you can choose a new password on the next screen.'
                  : 'We will email you a link that brings you back here to choose a new password.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 rounded-full bg-ink/70 p-1 text-sm font-semibold">
              <Tab to="/login" active={mode === 'sign-in'}>
                Sign in
              </Tab>
              <Tab to="/signup" active={mode === 'sign-up'}>
                Sign up
              </Tab>
            </div>
          )}

          {mode !== 'forgot' ? (
            <div className="mt-6">
              <button
                type="button"
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={onGoogle}
                disabled={googleOff || busy}
              >
                <GoogleIcon className="h-5 w-5" />
                Continue with Google
              </button>
              {googleOff ? (
                <p className="mt-2 text-center text-xs leading-5 text-mist">
                  Google sign-in is not enabled for this project yet. Use email, or set{' '}
                  <code>VITE_SUPABASE_GOOGLE_ENABLED=true</code> after you turn the provider on.
                </p>
              ) : session.mode === 'demo' ? (
                <p className="mt-2 text-center text-xs text-mist">Demo Google account signs in as Taha.</p>
              ) : null}
              <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-mist">
                <span className="h-px flex-1 bg-line" />
                or email
                <span className="h-px flex-1 bg-line" />
              </div>
            </div>
          ) : null}

          <form onSubmit={onSubmit} className={mode === 'forgot' ? 'mt-6 space-y-4' : 'space-y-4'}>
            {mode === 'sign-up' ? (
              <label className="block text-sm">
                <span className="mb-1.5 block text-mist">Username</span>
                <input
                  className={fieldClass}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  placeholder="sakura"
                  required
                />
                {nameNote ? (
                  <span
                    className={cn(
                      'mt-1.5 block text-xs',
                      nameTone === 'available' && 'text-foam',
                      (nameTone === 'taken' || nameTone === 'invalid') && 'text-sakura',
                      nameTone === 'checking' && 'text-mist',
                    )}
                  >
                    {nameNote}
                  </span>
                ) : null}
              </label>
            ) : null}

            <label className="block text-sm">
              <span className="mb-1.5 block text-mist">Email</span>
              <input
                className={fieldClass}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
                required
              />
            </label>

            {mode !== 'forgot' ? (
              <label className="block text-sm">
                <span className="mb-1.5 flex items-center justify-between text-mist">
                  Password
                  {mode === 'sign-in' ? (
                    <Link to="/forgot-password" className="text-xs font-medium text-sakura hover:underline">
                      Forgot password?
                    </Link>
                  ) : (
                    <span className="text-xs">At least 6 characters</span>
                  )}
                </span>
                <span className="relative block">
                  <input
                    className={`${fieldClass} pr-16`}
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-mist"
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </span>
              </label>
            ) : null}

            {error ? <p className="rounded-2xl bg-sakura/10 px-3 py-2 text-sm text-sakura">{error}</p> : null}
            {info ? <p className="rounded-2xl bg-foam/10 px-3 py-2 text-sm text-foam">{info}</p> : null}

            <button type="submit" className={`${primaryButton} w-full`} disabled={busy || (mode === 'sign-up' && nameTone === 'taken')}>
              {busy ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : mode === 'sign-up' ? 'Create account' : 'Send reset email'}
            </button>
          </form>

          {mode === 'forgot' ? (
            <Link to="/login" className="mt-4 block text-center text-sm text-mist hover:text-paper">
              Back to sign in
            </Link>
          ) : null}

          {session.mode === 'demo' ? (
            <p className="mt-5 rounded-2xl bg-white/5 px-3 py-2 text-center text-xs leading-5 text-mist">
              Demo fan <span className="text-paper">{DEMO_EMAIL}</span> · password{' '}
              <span className="text-paper">{DEMO_PASSWORD}</span>
            </p>
          ) : null}

          {session.mode === 'demo' ? (
            <button type="button" className="mt-4 w-full text-center text-xs text-mist hover:text-paper" onClick={session.leaveDemo}>
              Back to setup
            </button>
          ) : null}
          <Credit className="mt-6" />
        </section>
      </div>
    </div>
  )
}

function Tab({ to, active, night = false, children }: { to: string; active: boolean; night?: boolean; children: string }) {
  if (night) {
    return (
      <Link
        to={to}
        className={cn(
          'border-b-2 py-2 text-center transition',
          active ? 'border-[#ff8a1a] font-semibold text-[#ff8a1a]' : 'border-transparent text-[#b7c7da] hover:text-white',
        )}
      >
        {children}
      </Link>
    )
  }
  return (
    <Link
      to={to}
      className={cn(
        'rounded-full px-4 py-2 text-center transition',
        active ? 'bg-gradient-to-r from-sakura to-violet text-white' : 'text-mist hover:text-paper',
      )}
    >
      {children}
    </Link>
  )
}

function FieldIcon({ children }: { children: ReactNode }) {
  return <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8ea4bf]">{children}</span>
}

function UserGlyph() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 19.2c1.4-3 3.6-4.4 6.5-4.4s5.1 1.4 6.5 4.4" strokeLinecap="round" />
    </svg>
  )
}

function MailGlyph() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="M4 7l8 6 8-6" strokeLinecap="round" />
    </svg>
  )
}

function LockGlyph() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="5.5" y="10" width="13" height="9" rx="2" />
      <path d="M8.5 10V8a3.5 3.5 0 0 1 7 0v2" strokeLinecap="round" />
    </svg>
  )
}

function EyeGlyph({ off }: { off: boolean }) {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M2.5 12S6.5 6.5 12 6.5 21.5 12 21.5 12 17.5 17.5 12 17.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.4" />
      {off ? <path d="M5 19L19 5" strokeLinecap="round" /> : null}
    </svg>
  )
}
