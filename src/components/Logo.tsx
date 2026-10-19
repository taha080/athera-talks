import { cn } from '../lib/cn'

export function Logo({ className }: { className?: string }) {
  return (
    <svg className={cn('h-10 w-10', className)} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#1a56db" />
      <path fill="#fff" d="M16 20h32a6 6 0 0 1 6 6v12a6 6 0 0 1-6 6H28l-8 8v-8h-4a6 6 0 0 1-6-6V26a6 6 0 0 1 6-6z" />
    </svg>
  )
}
