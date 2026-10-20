import { useId } from 'react'
import { cn } from '../lib/cn'

const LABEL = 'Creator of Athera Talks'

// Twelve-lobe seal. The same outline clips the shine sweep.
const SCALLOP =
  'M16.00 2.05L16.52 2.21L17.00 2.67L17.43 3.34L17.80 4.08L18.13 4.77L18.45 5.27L18.81 5.52L19.24 5.49L19.78 5.21L20.40 4.78L21.10 4.32L21.80 3.96L22.45 3.80L22.97 3.92L23.34 4.32L23.53 4.96L23.57 5.75L23.52 6.57L23.46 7.33L23.48 7.93L23.67 8.33L24.07 8.52L24.67 8.54L25.43 8.48L26.25 8.43L27.04 8.47L27.68 8.66L28.08 9.02L28.20 9.55L28.04 10.20L27.68 10.90L27.22 11.60L26.79 12.22L26.51 12.76L26.48 13.19L26.73 13.55L27.23 13.87L27.92 14.20L28.66 14.57L29.33 15.00L29.79 15.48L29.95 16.00L29.79 16.52L29.33 17.00L28.66 17.43L27.92 17.80L27.23 18.13L26.73 18.45L26.48 18.81L26.51 19.24L26.79 19.78L27.22 20.40L27.68 21.10L28.04 21.80L28.20 22.45L28.08 22.97L27.68 23.34L27.04 23.53L26.25 23.57L25.43 23.52L24.67 23.46L24.07 23.48L23.67 23.67L23.48 24.07L23.46 24.67L23.52 25.43L23.57 26.25L23.53 27.04L23.34 27.68L22.97 28.08L22.45 28.20L21.80 28.04L21.10 27.68L20.40 27.22L19.78 26.79L19.24 26.51L18.81 26.48L18.45 26.73L18.13 27.23L17.80 27.92L17.43 28.66L17.00 29.33L16.52 29.79L16.00 29.95L15.48 29.79L15.00 29.33L14.57 28.66L14.20 27.92L13.87 27.23L13.55 26.73L13.19 26.48L12.76 26.51L12.22 26.79L11.60 27.22L10.90 27.68L10.20 28.04L9.55 28.20L9.02 28.08L8.66 27.68L8.47 27.04L8.43 26.25L8.48 25.43L8.54 24.67L8.52 24.07L8.33 23.67L7.93 23.48L7.33 23.46L6.57 23.52L5.75 23.57L4.96 23.53L4.32 23.34L3.92 22.98L3.80 22.45L3.96 21.80L4.32 21.10L4.78 20.40L5.21 19.78L5.49 19.24L5.52 18.81L5.27 18.45L4.77 18.13L4.08 17.80L3.34 17.43L2.67 17.00L2.21 16.52L2.05 16.00L2.21 15.48L2.67 15.00L3.34 14.57L4.08 14.20L4.77 13.87L5.27 13.55L5.52 13.19L5.49 12.76L5.21 12.22L4.78 11.60L4.32 10.90L3.96 10.20L3.80 9.55L3.92 9.02L4.32 8.66L4.96 8.47L5.75 8.43L6.57 8.48L7.33 8.54L7.93 8.52L8.33 8.33L8.52 7.93L8.54 7.33L8.48 6.57L8.43 5.75L8.47 4.96L8.66 4.32L9.02 3.92L9.55 3.80L10.20 3.96L10.90 4.32L11.60 4.78L12.22 5.21L12.76 5.49L13.19 5.52L13.55 5.27L13.87 4.77L14.20 4.08L14.57 3.34L15.00 2.67L15.48 2.21L16.00 2.05Z'

export function VerifiedTick({ className, size = 18 }: { className?: string; size?: number }) {
  const raw = useId().replace(/:/g, '')
  const blue = `verified-blue-${raw}`
  const tickMask = `verified-tick-mask-${raw}`
  const px = `${size}px`
  return (
    <span
      title="Verified"
      role="img"
      aria-label="Verified"
      className={cn('verified-tick inline-block shrink-0', className)}
      style={{
        width: px,
        height: px,
        mask: `url(#${tickMask}) center / 100% 100% no-repeat`,
        WebkitMask: `url(#${tickMask}) center / 100% 100% no-repeat`,
      }}
    >
      <svg viewBox="0 0 32 32" className="h-full w-full" aria-hidden="true">
        <defs>
          <linearGradient id={blue} x1="16" y1="2" x2="16" y2="30" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#4cc3ff" />
            <stop offset="1" stopColor="#0a7cff" />
          </linearGradient>
          <mask id={tickMask} maskUnits="objectBoundingBox" maskContentUnits="objectBoundingBox">
            <path d={SCALLOP} fill="#ffffff" transform="scale(0.03125)" />
          </mask>
        </defs>
        <path d={SCALLOP} fill={`url(#${blue})`} />
        <path
          d="M10.4 16.5 14.1 20.3 21.8 11.8"
          fill="none"
          stroke="#ffffff"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

export function CreatorBadge({ className, size = 18 }: { className?: string; size?: number }) {
  const raw = useId().replace(/:/g, '')
  const gold = `creator-gold-${raw}`
  const mask = `creator-mask-${raw}`
  const px = `${size}px`
  return (
    <span title={LABEL} role="img" aria-label={LABEL} className={cn('inline-flex shrink-0 items-center gap-1', className)}>
      <VerifiedTick size={size} />
      <span className="creator-seal relative inline-flex" style={{ width: px, height: px }}>
        <svg viewBox="0 0 32 32" className="h-full w-full overflow-visible" aria-hidden="true">
          <defs>
            <linearGradient id={gold} x1="4" y1="3" x2="28" y2="29" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#fff4b0" />
              <stop offset="0.38" stopColor="#f7c948" />
              <stop offset="0.68" stopColor="#c8901a" />
              <stop offset="1" stopColor="#fbe08a" />
            </linearGradient>
            <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">
              <path d={SCALLOP} fill="#ffffff" />
            </mask>
          </defs>
          <path d={SCALLOP} fill={`url(#${gold})`} />
          <text
            x="50%"
            y="50%"
            textAnchor="middle"
            dominantBaseline="central"
            fill="#6b4300"
            fontFamily="Georgia, 'Times New Roman', serif"
            fontSize="16"
            fontWeight="700"
          >
            C
          </text>
        </svg>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden"
          style={{ mask: `url(#${mask})`, WebkitMask: `url(#${mask})` }}
        >
          <span className="creator-shine" />
        </span>
      </span>
    </span>
  )
}

export function OfficialCreatorCard() {
  return (
    <section className="creator-card w-full rounded-2xl px-4 py-3 text-center" aria-label="Official Creator">
      <p className="text-sm font-semibold">Official Creator</p>
      <p className="mt-1 text-xs leading-5">Verified by Athera Talks · This badge can't be added by users</p>
    </section>
  )
}

export function DisplayName({
  name,
  creator,
  premium,
  className,
}: {
  name: string
  creator?: boolean | null
  premium?: boolean | null
  className?: string
}) {
  return (
    <span className={cn('inline-flex min-w-0 max-w-full items-center gap-1', className)}>
      <span className="truncate">{name}</span>
      {creator ? <CreatorBadge /> : premium ? <VerifiedTick /> : null}
    </span>
  )
}
