import type { ReactNode } from 'react'
import { ThemeSwitcher } from './ThemeSwitcher'

const STARS: Array<[number, number, number]> = [
  [80, 36, 1.1], [140, 80, 1.4], [210, 28, 1], [280, 96, 1.6], [360, 48, 1.2],
  [430, 18, 1], [510, 72, 1.5], [590, 34, 1.1], [670, 88, 1.3], [760, 22, 1],
  [840, 64, 1.7], [930, 40, 1.2], [1020, 90, 1], [1110, 26, 1.4], [1200, 70, 1.1],
  [1280, 18, 1.3], [1340, 96, 1], [170, 130, 1], [390, 120, 1.2], [700, 140, 1],
  [980, 128, 1.3], [1160, 150, 1], [60, 160, 1.1], [250, 170, 0.9], [540, 160, 1.2],
]

const FAR_HOUSES = [
  [90, 500, 54], [160, 520, 46], [230, 490, 62], [320, 530, 40], [390, 505, 58],
  [480, 525, 44], [560, 495, 66], [660, 518, 48], [740, 488, 60], [830, 522, 42],
  [910, 500, 70], [1010, 528, 50], [1100, 492, 58], [1190, 516, 46], [1280, 498, 64],
] as const

const NEAR_HOUSES = [
  [20, 640, 92], [130, 680, 78], [230, 650, 110], [360, 710, 86], [470, 660, 120],
  [610, 720, 80], [720, 655, 100], [850, 700, 90], [970, 645, 124], [1120, 690, 96],
  [1240, 650, 108], [1360, 710, 84],
] as const

// Original night scene: mountains, mist, roof silhouettes, and lantern glow.
export function NightVillage() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#07101c]" aria-hidden="true">
      <svg className="h-full w-full" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="night-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#07101f" />
            <stop offset="0.45" stopColor="#12243d" />
            <stop offset="1" stopColor="#1a314c" />
          </linearGradient>
          <filter id="mist-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="16" />
          </filter>
          <radialGradient id="lantern-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#ffb15a" stopOpacity="0.9" />
            <stop offset="0.45" stopColor="#ff8a1a" stopOpacity="0.28" />
            <stop offset="1" stopColor="#ff8a1a" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="1440" height="900" fill="url(#night-sky)" />
        {STARS.map(([x, y, r]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#f4f7ff" opacity={0.55 + (r % 1) * 0.3} />
        ))}
        <path
          fill="#1a2c46"
          d="M0 430 90 340 180 400 280 280 390 390 500 250 640 380 760 270 900 400 1040 290 1160 390 1280 300 1440 380 1440 900 0 900Z"
        />
        <path
          fill="#101b2e"
          d="M0 520 120 430 230 500 360 390 500 510 640 420 780 520 920 400 1080 510 1220 430 1440 500 1440 900 0 900Z"
        />
        <g filter="url(#mist-blur)" opacity="0.55">
          <ellipse cx="280" cy="520" rx="260" ry="46" fill="#c9d7ea" opacity="0.18" />
          <ellipse cx="860" cy="560" rx="340" ry="54" fill="#d5e2f2" opacity="0.16" />
          <ellipse cx="1240" cy="500" rx="220" ry="40" fill="#c9d7ea" opacity="0.14" />
        </g>
        {FAR_HOUSES.map(([x, y, w]) => (
          <House key={`far-${x}`} x={x} y={y} w={w} far />
        ))}
        <g filter="url(#mist-blur)" opacity="0.7">
          <ellipse cx="420" cy="640" rx="300" ry="36" fill="#d7e3f3" opacity="0.12" />
          <ellipse cx="1080" cy="670" rx="280" ry="32" fill="#e4eef8" opacity="0.1" />
        </g>
        {NEAR_HOUSES.map(([x, y, w]) => (
          <House key={`near-${x}`} x={x} y={y} w={w} />
        ))}
        <Lantern x={150} y={760} />
        <Lantern x={1280} y={740} />
      </svg>
    </div>
  )
}

function House({ x, y, w, far = false }: { x: number; y: number; w: number; far?: boolean }) {
  const roof = far ? '#243652' : '#1a2942'
  const wall = far ? '#152238' : '#0d1728'
  const h = w * 0.7
  return (
    <g transform={`translate(${x} ${y})`}>
      <path
        d={`M0 ${h * 0.42} L${w / 2} 0 L${w} ${h * 0.42} L${w * 0.84} ${h * 0.5} L${w / 2} ${h * 0.14} L${w * 0.16} ${h * 0.5} Z`}
        fill={roof}
      />
      <rect x={w * 0.14} y={h * 0.46} width={w * 0.72} height={h * 0.5} fill={wall} />
      <rect x={w * 0.24} y={h * 0.6} width={w * 0.12} height={h * 0.16} fill="#ffb15a" opacity={far ? 0.45 : 0.9} />
      <rect x={w * 0.55} y={h * 0.62} width={w * 0.1} height={h * 0.12} fill="#ffe0b0" opacity={far ? 0.35 : 0.75} />
    </g>
  )
}

function Lantern({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="0" cy="0" rx="90" ry="110" fill="url(#lantern-glow)" />
      <line x1="0" y1="-78" x2="0" y2="-58" stroke="#f0ddc2" strokeWidth="2" />
      <path d="M-16 -58 H16 L12 -66 H-12 Z" fill="#c45e10" />
      <rect x="-14" y="-56" width="28" height="46" rx="8" fill="#ff9a3c" />
      <rect x="-10" y="-50" width="20" height="34" rx="6" fill="#ffe1b5" opacity="0.75" />
      <path d="M-16 -8 H16 L12 0 H-12 Z" fill="#c45e10" />
    </g>
  )
}

export function NightShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-dvh">
      <NightVillage />
      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
        <ThemeSwitcher />
      </div>
      <div className="relative z-10 grid min-h-dvh place-items-center px-4 py-16">{children}</div>
    </div>
  )
}
