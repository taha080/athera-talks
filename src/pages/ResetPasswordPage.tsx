import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthFrame } from '../components/AuthFrame'
import { useSession } from '../context/SessionContext'
import { passwordIssue } from '../lib/auth'
import { fieldClass, primaryButton } from '../lib/styles'

const DEMO_RESET_KEY = 'tatalk:demo-reset'

export function ResetPasswordPage() {
  const session = useSession()
  const navigate = useNavigate()
  const demoEmail = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(DEMO_RESET_KEY) : null
  const canReset = session.mode === 'demo' ? Boolean(demoEmail) : session.recovery
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    const issue = passwordIssue(password)
    if (issue) {
      setError(issue)
      return
    }
    if (password !== confirm) {
      setError('Those passwords do not match.')
      return
    }
    setBusy(true)
    try {
      await session.updatePassword(password)
      if (session.mode === 'demo') {
        navigate('/login', { replace: true })
        return
      }
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthFrame title="Set new password" subtitle="Use at least 6 characters.">
      {canReset ? (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-paper">New password</span>
            <span className="relative block">
              <input
                className={`${fieldClass} pr-16`}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
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
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-paper">Confirm password</span>
            <input
              className={fieldClass}
              type={showPassword ? 'text' : 'password'}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              autoComplete="new-password"
              required
            />
          </label>
          {error ? (
            <p className="rounded-lg bg-[#f07167]/10 px-3 py-2 text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className={`${primaryButton} w-full`} disabled={busy} aria-busy={busy}>
            {busy ? 'Saving…' : 'Set new password'}
          </button>
        </form>
      ) : (
        <div className="text-sm leading-6 text-mist">
          <p>Open the reset link from your email, or request a new one.</p>
          <Link to="/forgot-password" className="mt-4 inline-block font-medium text-sakura">
            Request a new link
          </Link>
        </div>
      )}
      <Link to="/login" className="mt-4 block text-center text-sm text-mist hover:text-paper">
        Back to sign in
      </Link>
    </AuthFrame>
  )
}
