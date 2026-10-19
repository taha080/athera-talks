import { AuthFrame } from './AuthFrame'
import { Brand } from './Brand'
import { useSession } from '../context/SessionContext'
import { primaryButton } from '../lib/styles'

const steps = [
  'Create a free project at supabase.com',
  'Run supabase/schema.sql in the SQL editor',
  'Turn on Email auth, and Google if you want it',
  'Add the project URL and anon key to your environment',
]

export function SetupScreen() {
  const { enterDemo } = useSession()
  return (
    <AuthFrame wide title="Connect your project" subtitle="Add your keys, or preview the app.">
      <ol className="space-y-3 text-sm">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-elevated text-xs font-medium text-sakura">
              {index + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <button type="button" className={`${primaryButton} mt-6 w-full`} onClick={enterDemo}>
        Preview the app
      </button>
    </AuthFrame>
  )
}

export function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="text-center">
        <Brand />
        <p className="mt-4 text-sm text-mist">Opening…</p>
      </div>
    </div>
  )
}
