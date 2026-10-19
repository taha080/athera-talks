import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { useNavigate } from 'react-router-dom'
import { demoBackend } from '../demo/backend'
import { googleAuthMode, googleSignInError, normalizeUsername, usernameIssue, type GoogleAuthMode } from '../lib/auth'
import { readSupabaseEnv } from '../lib/config'
import { startMode } from '../lib/mode'
import { blobToDataUrl, squareAvatar } from '../lib/image'
import { getSupabase } from '../lib/supabase'
import { appUrl } from '../lib/url'
import { fetchProfile, liveChat, saveProfile, uploadAvatar, usernameAvailable } from '../services/liveBackend'
import type { Profile } from '../types'

const DEMO_KEY = 'tatalk:demo'
const RECOVERY_KEY = 'tatalk:recovery'
const DEMO_RESET_KEY = 'tatalk:demo-reset'

type Mode = 'setup' | 'demo' | 'live'

type SessionValue = {
  mode: Mode
  ready: boolean
  profile: Profile | null
  email: string | null
  recovery: boolean
  google: GoogleAuthMode
  chat: typeof liveChat
  enterDemo: () => void
  leaveDemo: () => void
  signIn: (email: string, password: string) => Promise<void>
  signUp: (input: { email: string; password: string; username: string }) => Promise<{ needsEmailConfirm: boolean }>
  signInWithGoogle: () => Promise<void>
  sendPasswordReset: (email: string) => Promise<{ demoReset: boolean }>
  updatePassword: (password: string) => Promise<void>
  usernameStatus: (username: string) => Promise<'available' | 'taken' | 'invalid'>
  signOut: () => Promise<void>
  updateProfile: (patch: { username: string; favouriteAnime: string | null }) => Promise<void>
  uploadAvatarFile: (file: File) => Promise<void>
  resetDemo: () => Profile | null
}

const SessionContext = createContext<SessionValue | null>(null)

function initialMode(configured: boolean): Mode {
  const demoStored = typeof localStorage !== 'undefined' && localStorage.getItem(DEMO_KEY) === '1'
  return startMode(configured, demoStored)
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const configured = readSupabaseEnv().configured
  const [mode, setMode] = useState<Mode>(() => initialMode(configured))
  const [ready, setReady] = useState(mode !== 'live')
  const [profile, setProfile] = useState<Profile | null>(() =>
    mode === 'demo' ? demoBackend.currentProfile() : null,
  )
  const [email, setEmail] = useState<string | null>(() => (mode === 'demo' ? demoBackend.currentEmail() : null))
  const [recovery, setRecovery] = useState(
    () => typeof sessionStorage !== 'undefined' && sessionStorage.getItem(RECOVERY_KEY) === '1',
  )

  const google = googleAuthMode(import.meta.env.VITE_SUPABASE_GOOGLE_ENABLED, mode === 'demo')
  const chat = mode === 'live' ? liveChat : demoBackend

  const hydrate = useCallback(async (session: Session | null) => {
    if (!session) {
      setProfile(null)
      setEmail(null)
      setReady(true)
      return
    }
    setEmail(session.user.email ?? null)
    try {
      setProfile(await fetchProfile(session.user.id))
    } catch (error) {
      setProfile(null)
      console.error(error)
    } finally {
      setReady(true)
    }
  }, [])

  useEffect(() => {
    if (mode !== 'live') return
    const supabase = getSupabase()
    if (!supabase) {
      setReady(true)
      return
    }

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        sessionStorage.setItem(RECOVERY_KEY, '1')
        setRecovery(true)
        window.setTimeout(() => navigate('/reset-password'), 0)
      }
      // Supabase warns against awaiting other queries inside this callback.
      window.setTimeout(() => {
        void hydrate(session)
      }, 0)
    })

    return () => subscription.subscription.unsubscribe()
  }, [hydrate, mode, navigate])

  const signIn = useCallback(
    async (nextEmail: string, password: string) => {
      if (mode === 'demo') {
        const next = await demoBackend.signIn(nextEmail, password)
        setProfile(next)
        setEmail(demoBackend.currentEmail())
        return
      }
      const { error } = await getSupabase()!.auth.signInWithPassword({
        email: nextEmail.trim(),
        password,
      })
      if (error) throw new Error(error.message)
    },
    [mode],
  )

  const signUp = useCallback(
    async (input: { email: string; password: string; username: string }) => {
      const username = normalizeUsername(input.username)
      if (mode === 'demo') {
        const next = await demoBackend.signUp({ ...input, username })
        setProfile(next)
        setEmail(demoBackend.currentEmail())
        return { needsEmailConfirm: false }
      }
      const { data, error } = await getSupabase()!.auth.signUp({
        email: input.email.trim(),
        password: input.password,
        options: {
          data: { username },
          emailRedirectTo: appUrl('/'),
        },
      })
      if (error) throw new Error(error.message)
      return { needsEmailConfirm: !data.session }
    },
    [mode],
  )

  const signInWithGoogle = useCallback(async () => {
    if (mode === 'demo') {
      const next = await demoBackend.signInWithGoogle()
      setProfile(next)
      setEmail(demoBackend.currentEmail())
      return
    }
    if (google !== 'ready') {
      throw new Error('Google sign-in is not enabled yet.')
    }
    const { error } = await getSupabase()!.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: appUrl('/') },
    })
    if (error) throw new Error(googleSignInError(error.message))
  }, [google, mode])

  const sendPasswordReset = useCallback(
    async (nextEmail: string) => {
      const cleaned = nextEmail.trim().toLowerCase()
      if (mode === 'demo') {
        const result = demoBackend.requestPasswordReset(cleaned)
        if (!result.found) throw new Error('No demo account uses that email.')
        sessionStorage.setItem(DEMO_RESET_KEY, cleaned)
        return { demoReset: true }
      }
      const { error } = await getSupabase()!.auth.resetPasswordForEmail(cleaned, {
        redirectTo: appUrl('/reset-password'),
      })
      if (error) throw new Error(error.message)
      return { demoReset: false }
    },
    [mode],
  )

  const updatePassword = useCallback(
    async (password: string) => {
      if (mode === 'demo') {
        const demoEmail = sessionStorage.getItem(DEMO_RESET_KEY)
        if (!demoEmail) throw new Error('Request a reset from the sign-in page first.')
        demoBackend.resetPassword(demoEmail, password)
        sessionStorage.removeItem(DEMO_RESET_KEY)
        return
      }
      const { error } = await getSupabase()!.auth.updateUser({ password })
      if (error) throw new Error(error.message)
      sessionStorage.removeItem(RECOVERY_KEY)
      setRecovery(false)
    },
    [mode],
  )

  const usernameStatus = useCallback(
    async (username: string): Promise<'available' | 'taken' | 'invalid'> => {
      if (usernameIssue(username)) return 'invalid'
      const available =
        mode === 'demo' ? demoBackend.usernameAvailable(username) : await usernameAvailable(username)
      return available ? 'available' : 'taken'
    },
    [mode],
  )

  const signOut = useCallback(async () => {
    if (mode === 'demo') {
      demoBackend.signOut()
    } else {
      await getSupabase()?.auth.signOut()
    }
    sessionStorage.removeItem(RECOVERY_KEY)
    setRecovery(false)
    setProfile(null)
    setEmail(null)
  }, [mode])

  const updateProfile = useCallback(
    async (patch: { username: string; favouriteAnime: string | null }) => {
      if (!profile) throw new Error('Sign in first.')
      const next =
        mode === 'demo' ? await demoBackend.saveProfile(patch) : await saveProfile(profile.id, patch)
      setProfile(next)
    },
    [mode, profile],
  )

  const uploadAvatarFile = useCallback(
    async (file: File) => {
      if (!profile) throw new Error('Sign in first.')
      if (!file.type.startsWith('image/')) throw new Error('Choose an image file.')
      if (file.size > 2_000_000) throw new Error('Choose an image under 2 MB.')
      const blob = await squareAvatar(file)
      const next =
        mode === 'demo'
          ? await demoBackend.uploadAvatar(await blobToDataUrl(blob))
          : await uploadAvatar(profile.id, blob)
      setProfile(next)
    },
    [mode, profile],
  )

  const enterDemo = useCallback(() => {
    localStorage.setItem(DEMO_KEY, '1')
    setMode('demo')
    setProfile(demoBackend.currentProfile())
    setEmail(demoBackend.currentEmail())
    setReady(true)
    navigate('/login')
  }, [navigate])

  const leaveDemo = useCallback(() => {
    localStorage.removeItem(DEMO_KEY)
    demoBackend.signOut()
    setProfile(null)
    setEmail(null)
    setMode('setup')
    navigate('/')
  }, [navigate])

  const resetDemo = useCallback(() => {
    demoBackend.reset()
    const next = demoBackend.currentProfile()
    setProfile(next)
    setEmail(demoBackend.currentEmail())
    return next
  }, [])

  const value = useMemo<SessionValue>(
    () => ({
      mode,
      ready,
      profile,
      email,
      recovery,
      google,
      chat,
      enterDemo,
      leaveDemo,
      signIn,
      signUp,
      signInWithGoogle,
      sendPasswordReset,
      updatePassword,
      usernameStatus,
      signOut,
      updateProfile,
      uploadAvatarFile,
      resetDemo,
    }),
    [
      chat,
      email,
      enterDemo,
      google,
      leaveDemo,
      mode,
      profile,
      ready,
      recovery,
      resetDemo,
      sendPasswordReset,
      signIn,
      signInWithGoogle,
      signOut,
      signUp,
      updatePassword,
      updateProfile,
      uploadAvatarFile,
      usernameStatus,
    ],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession must be used inside SessionProvider')
  return value
}
