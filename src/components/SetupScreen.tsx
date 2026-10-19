import { useTheme } from '../context/ThemeContext'
import { useSession } from '../context/SessionContext'
import { primaryButton } from '../lib/styles'
import { Brand } from './Brand'
import { Credit } from './Credit'
import { KunaiMark } from './KunaiMark'
import { NightShell } from './NightVillage'
import { ThemeSwitcher } from './ThemeSwitcher'

const steps = [
  'Create a free project at supabase.com',
  'Run supabase/schema.sql in the SQL editor',
  'Turn on Email auth (and Google, if you want it)',
  'Copy the project URL and anon key into a .env file',
]

export function SetupScreen() {
  const { enterDemo } = useSession()
  const { theme } = useTheme()
  if (theme === 'naruto') return <NightSetup onDemo={enterDemo} />
  return (
    <div className="relative grid min-h-dvh place-items-center px-4 py-10">
      <Glow />
      <div className="relative w-full max-w-lg rounded-[2rem] border border-line bg-panel/90 p-8 shadow-2xl shadow-black/40">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <Brand large />
          <ThemeSwitcher />
        </div>
        <h1 className="mt-8 text-3xl font-semibold tracking-tight">Connect Supabase to start talking.</h1>
        <p className="mt-3 text-sm leading-6 text-mist">
          The app did not find <code className="text-paper">VITE_SUPABASE_URL</code> and{' '}
          <code className="text-paper">VITE_SUPABASE_ANON_KEY</code>. Nothing crashed — add the keys, or preview
          the interface with sample fans.
        </p>
        <ol className="mt-6 space-y-3 text-sm">
          {steps.map((step, index) => (
            <li key={step} className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/10 text-xs text-sakura">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <button type="button" className={`${primaryButton} mt-8 w-full`} onClick={enterDemo}>
          Preview the demo
        </button>
        <Credit className="mt-6" />
      </div>
    </div>
  )
}

function NightSetup({ onDemo }: { onDemo: () => void }) {
  return (
    <NightShell>
      <div className="night-card w-full max-w-lg rounded-2xl px-6 py-8 sm:px-8">
        <div className="text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-[#ff8a1a]/80 bg-[#0c1830] text-[#ff9a2e] shadow-[0_0_24px_rgba(255,138,26,0.28)]">
            <KunaiMark className="h-7 w-7" />
          </span>
          <p className="font-display mt-3 text-4xl font-semibold tracking-wide text-white">T.A.Talk</p>
          <p className="mt-1 text-sm text-[#c5d4e6]">Connect the village, or walk through the demo.</p>
        </div>
        <h1 className="mt-6 text-center text-2xl font-semibold tracking-tight">Connect Supabase to start talking.</h1>
        <p className="mt-3 text-center text-sm leading-6 text-[#b7c7da]">
          The app did not find <code className="text-white">VITE_SUPABASE_URL</code> and{' '}
          <code className="text-white">VITE_SUPABASE_ANON_KEY</code>. Nothing crashed — add the keys, or preview
          the interface with sample fans.
        </p>
        <ol className="mt-6 space-y-3 text-sm">
          {steps.map((step, index) => (
            <li key={step} className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[#ff8a1a]/50 text-xs text-[#ff8a1a]">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <button type="button" className="night-button mt-8" onClick={onDemo}>
          <KunaiMark className="h-4 w-4 text-[#ff8a1a]" />
          Preview the demo
        </button>
        <Credit className="mt-6" />
      </div>
    </NightShell>
  )
}

export function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="text-center">
        <Brand />
        <p className="mt-4 text-sm text-mist">Opening your circle…</p>
      </div>
    </div>
  )
}

export function Glow() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-sakura/20 blur-3xl" />
      <div className="absolute right-0 top-1/3 h-96 w-96 rounded-full bg-violet/20 blur-3xl" />
      <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-sakura/10 blur-3xl" />
    </div>
  )
}
