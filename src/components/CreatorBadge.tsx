import { cn } from '../lib/cn'

const LABEL = 'Creator of Athera Talks'

export function CreatorBadge({ className }: { className?: string }) {
  return (
    <span title={LABEL} className="inline-flex shrink-0">
      <svg
        viewBox="0 0 14 14"
        className={cn('h-3.5 w-3.5 text-sakura', className)}
        role="img"
        aria-label={LABEL}
      >
        <circle cx="7" cy="7" r="7" fill="currentColor" />
        <path
          d="M4.1 7.15 6.05 9.15 9.9 4.85"
          fill="none"
          stroke="var(--panel)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

export function DisplayName({
  name,
  creator,
  className,
}: {
  name: string
  creator?: boolean | null
  className?: string
}) {
  return (
    <span className={cn('inline-flex min-w-0 max-w-full items-center gap-1', className)}>
      <span className="truncate">{name}</span>
      {creator ? <CreatorBadge /> : null}
    </span>
  )
}
