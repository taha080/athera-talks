import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { Credit } from '../components/Credit'
import { Glow } from '../components/SetupScreen'
import { ThemeSwitcher } from '../components/ThemeSwitcher'
import { GoogleIcon } from '../components/Icons'
import { useSession } from '../context/SessionContext'
import { isValidEmail, normalizeUsername, passwordIssue, usernameIssue } from '../lib/auth'
import { cn } from '../lib/cn'
import { fieldClass, primaryButton } from '../lib/styles'
import { DEMO_EMAIL, DEMO_PASSWORD } from '../demo/seed'

type AuthMode = 'sign-in' | 'sign-up' | 'forgot'

export function AuthScreen({ mode }: { mode: AuthMode }) {
  const session = useSession()
  const navigate = useNavigate()
  const [email, setEmail] = useState(session.mode === 'demo' ? DEMO_EMAIL : '')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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
        const result = await session.signUp({ email, password, username })
        if (result.needsEmailConfirm) {
          setInfo('Check your email to confirm the account, then sign in.')
        }
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

  return (
    <div className="relative min-h-dvh">
      <Glow />
      <div className="mx-auto grid min-h-dvh max-w-6xl items-center gap-10 px-4 py-8 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
        <section className="max-w-xl">
          <Brand large />
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
          <ThemeSwitcher className="mb-5 justify-between" />
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

function Tab({ to, active, children }: { to: string; active: boolean; children: string }) {
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
