import { cn } from '../lib/cn'

const PALETTES = [
  ['#ff4f8b', '#8d6bff'],
  ['#22d3ee', '#6366f1'],
  ['#f59e0b', '#ef4444'],
  ['#34d399', '#0ea5e9'],
  ['#fb7185', '#f97316'],
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
}: {
  name: string
  url?: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
  online?: boolean
}) {
  const px = { sm: 'h-10 w-10 text-xs', md: 'h-12 w-12 text-sm', lg: 'h-16 w-16 text-lg', xl: 'h-28 w-28 text-3xl' }[size]
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
    <span className="relative inline-flex shrink-0">
      {face}
      {online ? <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-panel bg-foam" aria-label="Online" /> : null}
    </span>
  )
}
