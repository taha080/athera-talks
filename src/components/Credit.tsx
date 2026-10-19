import { cn } from '../lib/cn'

export function Credit({ className }: { className?: string }) {
  return <p className={cn('text-center text-xs text-mist', className)}>Created by Taha Ahsan</p>
}
