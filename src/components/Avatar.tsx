import { cn } from '../lib/cn'

const PALETTES = [
  ['#1a56db', '#3b82f6'],
  ['#0f766e', '#14b8a6'],
  ['#334155', '#64748b'],
  ['#1e3a5f', '#3b6ea5'],
  ['#3f3f46', '#71717a'],
]

function gradient(name: string): string {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  const [from, to] = PALETTES[hash % PALETTES.length]
  return `linear-gradient(135deg, ${from}, ${to})`
}

export function Avatar({
  name,
  url,
  size = 'md',
  online = false,
  creator = false,
}: {
  name: string
  url?: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
  online?: boolean
  creator?: boolean
}) {
  const px = { sm: 'h-10 w-10 text-xs', md: 'h-12 w-12 text-sm', lg: 'h-16 w-16 text-lg', xl: 'h-36 w-36 text-3xl' }[size]
  const ring = creator ? (size === 'xl' ? 'creator-ring creator-ring-lg' : 'creator-ring') : ''
  const initials = name.slice(0, 2).toUpperCase()
  const face = url ? (
    <img src={url} alt="" className={cn('shrink-0 rounded-full object-cover', px)} />
  ) : (
    <span
      aria-hidden="true"
      className={cn('grid shrink-0 place-items-center rounded-full font-semibold text-white', px)}
      style={{ background: gradient(name || 'fan') }}
    >
      {initials || 'AT'}
    </span>
  )
  return (
    <span className={cn('relative inline-flex shrink-0 rounded-full', ring)}>
      {face}
      {online ? <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-panel bg-foam" aria-label="Online" /> : null}
    </span>
  )
}
