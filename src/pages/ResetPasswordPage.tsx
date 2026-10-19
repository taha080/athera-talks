import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { Credit } from '../components/Credit'
import { Glow } from '../components/SetupScreen'
import { KunaiMark } from '../components/KunaiMark'
import { NightShell } from '../components/NightVillage'
import { useSession } from '../context/SessionContext'
import { useTheme } from '../context/ThemeContext'
import { passwordIssue } from '../lib/auth'
import { fieldClass, primaryButton } from '../lib/styles'

const DEMO_RESET_KEY = 'tatalk:demo-reset'

export function ResetPasswordPage() {
  const session = useSession()
  const { theme } = useTheme()
  const navigate = useNavigate()
  const demoEmail = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(DEMO_RESET_KEY) : null
  const canReset = session.mode === 'demo' ? Boolean(demoEmail) : session.recovery
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
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

  if (theme === 'naruto') {
    return (
      <NightShell>
        <div className="night-card w-full max-w-md rounded-2xl px-6 py-7 sm:px-8">
          <div className="text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-[#ff8a1a]/80 bg-[#0c1830] text-[#ff9a2e]">
              <KunaiMark className="h-7 w-7" />
            </span>
            <p className="font-display mt-3 text-4xl text-white">T.A.Talk</p>
          </div>
          <h1 className="mt-6 text-center text-xl font-semibold">Choose a new password</h1>
          {canReset ? (
            <form onSubmit={onSubmit} className="mt-5 space-y-3">
              <input
                className="night-field !pl-4"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                placeholder="New password"
                required
              />
              <input
                className="night-field !pl-4"
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                autoComplete="new-password"
                placeholder="Confirm password"
                required
              />
              {error ? <p className="rounded-lg bg-[#ff8a1a]/10 px-3 py-2 text-sm text-[#ffb15a]">{error}</p> : null}
              <button type="submit" className="night-button" disabled={busy}>
                <KunaiMark className="h-4 w-4 text-[#ff8a1a]" />
                {busy ? 'Saving…' : 'Update password'}
              </button>
            </form>
          ) : (
            <div className="mt-4 text-center text-sm leading-6 text-[#b7c7da]">
              <p>Open the reset link from your email, or request a new one. The link expires.</p>
              <Link to="/forgot-password" className="mt-4 inline-block font-medium text-[#ff8a1a]">
                Request a new link
              </Link>
            </div>
          )}
          <Link to="/login" className="mt-6 block text-center text-sm text-[#b7c7da] hover:text-white">
            Back to sign in
          </Link>
          <Credit className="mt-6" />
        </div>
      </NightShell>
    )
  }

  return (
    <div className="relative grid min-h-dvh place-items-center px-4 py-10">
      <Glow />
      <div className="relative w-full max-w-md rounded-[2rem] border border-line bg-panel/90 p-8 shadow-2xl shadow-black/40">
        <Brand />
        <h1 className="mt-8 text-2xl font-semibold">Choose a new password</h1>
        {canReset ? (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <label className="block text-sm">
              <span className="mb-1.5 block text-mist">New password</span>
              <input
                className={fieldClass}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-mist">Confirm password</span>
              <input
                className={fieldClass}
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
            {error ? <p className="rounded-2xl bg-sakura/10 px-3 py-2 text-sm text-sakura">{error}</p> : null}
            <button type="submit" className={`${primaryButton} w-full`} disabled={busy}>
              {busy ? 'Saving…' : 'Update password'}
            </button>
          </form>
        ) : (
          <div className="mt-4 text-sm leading-6 text-mist">
            <p>Open the reset link from your email, or request a new one. The link expires.</p>
            <Link to="/forgot-password" className="mt-4 inline-block font-medium text-sakura">
              Request a new link
            </Link>
          </div>
        )}
        <Link to="/login" className="mt-6 block text-center text-sm text-mist hover:text-paper">
          Back to sign in
        </Link>
        <Credit className="mt-6" />
      </div>
    </div>
  )
}
