import { cn } from '../lib/cn'

export function Brand({ large = false }: { large?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          'grid place-items-center rounded-2xl bg-gradient-to-br from-sakura to-violet font-bold text-white shadow-lg shadow-sakura/30',
          large ? 'h-14 w-14 text-lg' : 'h-11 w-11 text-sm',
        )}
      >
        TA
      </span>
      <div>
        <p className={cn('font-semibold tracking-tight', large ? 'text-2xl' : 'text-lg')}>T.A.Talk</p>
        <p className="text-xs text-mist">Anime circle chat</p>
      </div>
    </div>
  )
}
