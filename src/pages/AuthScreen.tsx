import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { AuthFrame } from '../components/AuthFrame'
import { GoogleIcon } from '../components/Icons'
import { useSession } from '../context/SessionContext'
import { isValidEmail, normalizeUsername, passwordIssue, usernameIssue } from '../lib/auth'
import { cn } from '../lib/cn'
import { fieldClass, primaryButton } from '../lib/styles'
import { DEMO_EMAIL, DEMO_PASSWORD } from '../demo/seed'

type AuthMode = 'sign-in' | 'sign-up' | 'forgot'

export function AuthScreen({ mode }: { mode: AuthMode }) {
  const session = useSession()
  const usernameStatus = session.usernameStatus
  const navigate = useNavigate()
  const [email, setEmail] = useState(session.mode === 'demo' ? DEMO_EMAIL : '')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [username, setUsername] = useState('')
  const [nameNote, setNameNote] = useState('')
  const [nameTone, setNameTone] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle')
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [confirmError, setConfirmError] = useState('')
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
      void usernameStatus(username).then((status) => {
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
  }, [mode, usernameStatus, username])

  if (session.profile && !session.recovery) return <Navigate to="/" replace />

  const title = mode === 'forgot' ? 'Reset password' : mode === 'sign-up' ? 'Create your account' : 'Sign in'
  const submitLabel = busy
    ? mode === 'sign-in'
      ? 'Signing in…'
      : mode === 'sign-up'
        ? 'Creating account…'
        : 'Sending…'
    : mode === 'sign-in'
      ? 'Sign in'
      : mode === 'sign-up'
        ? 'Create account'
        : 'Send reset link'

  function checkEmail() {
    const ok = isValidEmail(email)
    setEmailError(ok ? '' : 'Enter a valid email address.')
    return ok
  }

  function checkPassword() {
    if (mode === 'forgot') {
      setPasswordError('')
      return true
    }
    const issue = passwordIssue(password)
    setPasswordError(issue ?? '')
    return !issue
  }

  function checkConfirm() {
    if (mode !== 'sign-up') return true
    const mismatch = !confirm || password !== confirm
    setConfirmError(mismatch ? 'Those passwords do not match.' : '')
    return !mismatch
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setInfo('')
    const emailOk = checkEmail()
    const passwordOk = checkPassword()
    const confirmOk = mode === 'sign-up' ? checkConfirm() : true
    if (!emailOk) return
    if (mode === 'forgot') {
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
    if (!passwordOk || !confirmOk) return

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

  return (
    <AuthFrame title={title} privacy={mode === 'sign-in'}>
      {mode !== 'forgot' ? (
        <div className="mb-4 grid grid-cols-2 rounded-lg bg-elevated p-1 text-sm font-medium" role="tablist" aria-label="Account">
          <Tab to="/login" active={mode === 'sign-in'}>
            Sign in
          </Tab>
          <Tab to="/signup" active={mode === 'sign-up'}>
            Sign up
          </Tab>
        </div>
      ) : (
        <p className="mb-4 text-sm leading-6 text-mist">
          {session.mode === 'demo'
            ? 'If this email matches the demo account, you can choose a new password next.'
            : 'We will email you a link to choose a new password.'}
        </p>
      )}

      {mode !== 'forgot' ? (
        <div className="mb-4">
          <button
            type="button"
            className="inline-flex min-h-10 w-full items-center justify-center gap-3 rounded-lg border border-line bg-white px-4 py-2.5 text-sm font-medium text-[#1c2128] shadow-sm transition hover:bg-[#f6f8fa] disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void onGoogle()}
            disabled={googleOff || busy}
          >
            <GoogleIcon className="h-5 w-5" />
            Continue with Google
          </button>
          {googleOff ? <p className="mt-2 text-center text-xs text-mist">Google sign-in is not available.</p> : null}
          {session.mode === 'demo' && !googleOff ? (
            <p className="mt-2 text-center text-xs text-mist">Demo Google signs in as Taha.</p>
          ) : null}
          <div className="my-4 flex items-center gap-3 text-xs text-mist">
            <span className="h-px flex-1 bg-line" />
            or
            <span className="h-px flex-1 bg-line" />
          </div>
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {mode === 'sign-up' ? (
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-paper">Username</span>
            <input
              className={fieldClass}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              placeholder="yourname"
              aria-invalid={nameTone === 'taken' || nameTone === 'invalid'}
              required
            />
            {nameNote ? (
              <span
                className={cn(
                  'mt-1.5 block text-xs',
                  nameTone === 'available' && 'text-foam',
                  (nameTone === 'taken' || nameTone === 'invalid') && 'text-danger',
                  nameTone === 'checking' && 'text-mist',
                )}
              >
                {nameNote}
              </span>
            ) : null}
          </label>
        ) : null}

        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-paper">Email</span>
          <input
            className={fieldClass}
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              if (emailError) setEmailError('')
            }}
            onBlur={checkEmail}
            autoComplete="email"
            placeholder="you@example.com"
            aria-invalid={Boolean(emailError)}
            required
          />
          {emailError ? <span className="mt-1.5 block text-xs text-danger">{emailError}</span> : null}
        </label>

        {mode !== 'forgot' ? (
          <label className="block text-sm">
            <span className="mb-1.5 flex items-center justify-between font-medium text-paper">
              Password
              {mode === 'sign-in' ? (
                <Link to="/forgot-password" className="text-xs font-medium text-sakura hover:underline">
                  Forgot password?
                </Link>
              ) : (
                <span className="text-xs font-normal text-mist">At least 6 characters</span>
              )}
            </span>
            <span className="relative block">
              <input
                className={`${fieldClass} pr-16`}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value)
                  if (passwordError) setPasswordError('')
                }}
                onBlur={checkPassword}
                autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                placeholder="••••••••"
                aria-invalid={Boolean(passwordError)}
                required
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-medium text-mist hover:text-paper"
                onClick={() => setShowPassword((value) => !value)}
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </span>
            {passwordError ? <span className="mt-1.5 block text-xs text-danger">{passwordError}</span> : null}
          </label>
        ) : null}

        {mode === 'sign-up' ? (
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-paper">Confirm password</span>
            <span className="relative block">
              <input
                className={`${fieldClass} pr-16`}
                type={showConfirm ? 'text' : 'password'}
                value={confirm}
                onChange={(event) => {
                  setConfirm(event.target.value)
                  if (confirmError) setConfirmError('')
                }}
                onBlur={checkConfirm}
                autoComplete="new-password"
                placeholder="••••••••"
                aria-invalid={Boolean(confirmError)}
                required
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-medium text-mist hover:text-paper"
                onClick={() => setShowConfirm((value) => !value)}
                aria-pressed={showConfirm}
                aria-label={showConfirm ? 'Hide confirmation' : 'Show confirmation'}
              >
                {showConfirm ? 'Hide' : 'Show'}
              </button>
            </span>
            {confirmError ? <span className="mt-1.5 block text-xs text-danger">{confirmError}</span> : null}
          </label>
        ) : null}

        {error ? (
          <p className="rounded-lg bg-[#f07167]/10 px-3 py-2 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        {info ? (
          <p className="rounded-lg bg-foam/10 px-3 py-2 text-sm text-foam" role="status">
            {info}
          </p>
        ) : null}

        <button
          type="submit"
          className={`${primaryButton} w-full`}
          disabled={busy || (mode === 'sign-up' && nameTone === 'taken')}
          aria-busy={busy}
        >
          {submitLabel}
        </button>
      </form>

      {mode === 'forgot' ? (
        <Link to="/login" className="mt-4 block text-center text-sm text-mist hover:text-paper">
          Back to sign in
        </Link>
      ) : null}

      {session.mode === 'demo' ? (
        <p className="mt-4 text-center text-xs text-mist">
          Demo · {DEMO_EMAIL} · {DEMO_PASSWORD}
        </p>
      ) : null}
      {session.mode === 'demo' ? (
        <button type="button" className="mt-2 w-full text-center text-xs text-mist hover:text-paper" onClick={session.leaveDemo}>
          Back to setup
        </button>
      ) : null}
    </AuthFrame>
  )
}

function Tab({ to, active, children }: { to: string; active: boolean; children: string }) {
  return (
    <Link
      to={to}
      role="tab"
      aria-selected={active}
      className={cn(
        'rounded-md px-3 py-2 text-center transition',
        active ? 'bg-panel text-paper shadow-sm' : 'text-mist hover:text-paper',
      )}
    >
      {children}
    </Link>
  )
}
