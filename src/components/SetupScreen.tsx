import { Brand } from './Brand'
import { Credit } from './Credit'
import { primaryButton } from '../lib/styles'
import { useSession } from '../context/SessionContext'

const steps = [
  'Create a free project at supabase.com',
  'Run supabase/schema.sql in the SQL editor',
  'Turn on Email auth (and Google, if you want it)',
  'Copy the project URL and anon key into a .env file',
]

export function SetupScreen() {
  const { enterDemo } = useSession()
  return (
    <div className="relative grid min-h-dvh place-items-center px-4 py-10">
      <Glow />
      <div className="relative w-full max-w-lg rounded-[2rem] border border-line bg-panel/90 p-8 shadow-2xl shadow-black/40">
        <Brand large />
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
