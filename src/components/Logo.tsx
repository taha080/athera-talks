import { useId } from 'react'
import { cn } from '../lib/cn'

const LOOPS =
  'M 33.40 31.20 A 10.85 10.85 0 1 1 11.70 31.20 A 10.85 10.85 0 1 1 33.40 31.20 M 52.30 31.20 A 10.85 10.85 0 1 1 30.60 31.20 A 10.85 10.85 0 1 1 52.30 31.20'

const TAILS = 'M 22.31 43.85 L 16.72 47.22 L 14.60 41.04 Z M 49.40 41.04 L 47.28 47.22 L 41.69 43.85 Z'

export function Logo({ className }: { className?: string }) {
  const gradient = `lavender-infinity-${useId().replace(/:/g, '')}`
  return (
    <svg className={cn('h-10 w-10', className)} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={gradient} x1="6" y1="0" x2="58" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#e6d1fc" />
          <stop offset="1" stopColor="#c396f4" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14.5" fill={`url(#${gradient})`} />
      <path d={LOOPS} fill="none" stroke="#fff" strokeWidth="6.7" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d={TAILS}
        fill="#fff"
        stroke="#fff"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
