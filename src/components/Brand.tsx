import { APP_NAME } from '../lib/brand'
import { cn } from '../lib/cn'
import { Logo } from './Logo'

export function Brand({ large = false }: { large?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Logo className={large ? 'h-12 w-12' : 'h-10 w-10'} />
      <div>
        <p className={cn('font-semibold tracking-tight text-paper', large ? 'text-xl' : 'text-base')}>{APP_NAME}</p>
        <p className="text-xs text-mist">Private messages and voice calls</p>
      </div>
    </div>
  )
}
