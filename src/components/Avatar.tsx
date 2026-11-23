import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '../lib/cn'
import { avatarAnimates } from '../lib/premium'
import creatorFrameWebp from '../assets/frames/creator-frame.webp'
import creatorFrameGif from '../assets/frames/creator-frame.gif'

// The creator's animated frame. The art is a square whose transparent
// centre hole is 54.77% of its width, centred (measured from the art).
// Scaling the overlay by 1 / 0.5477 makes the avatar fill the hole exactly
// at any avatar size. The overlay ignores pointer events.
const CREATOR_FRAME_HOLE = 0.5477
// How far the visible art (crown, wings, bottom ornaments) reaches past the
// avatar on each side, as a fraction of the avatar diameter (measured from
// the art). The wrapper reserves this space with margins so a username,
// tick or badge laid out next to or under the avatar is never covered.
const CREATOR_FRAME_REACH = { top: 0.21, side: 0.3, bottom: 0.3 }

export function CreatorFrame({ children, px, stacked = false }: { children: ReactNode; px: number; stacked?: boolean }) {
  const scale = `${(100 / CREATOR_FRAME_HOLE).toFixed(2)}%`
  // In list rows (stacked = false) only the sides are reserved so rows keep
  // their height; the frame's top and bottom may spill into row padding.
  const margin = {
    marginTop: stacked ? Math.round(px * CREATOR_FRAME_REACH.top) : 0,
    marginBottom: stacked ? Math.round(px * CREATOR_FRAME_REACH.bottom) : 0,
    marginLeft: Math.round(px * CREATOR_FRAME_REACH.side),
    marginRight: Math.round(px * CREATOR_FRAME_REACH.side),
  }
  return (
    <span className="creator-frame relative inline-flex shrink-0" style={margin}>
      {children}
      <picture>
        <source srcSet={creatorFrameWebp} type="image/webp" />
        <img
          src={creatorFrameGif}
          alt=""
          aria-hidden="true"
          draggable={false}
          decoding="async"
          className="creator-frame-art"
          style={{ width: scale, height: scale }}
        />
      </picture>
    </span>
  )
}

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

function Initials({ name, className }: { name: string; className: string }) {
  const initials = name.slice(0, 2).toUpperCase()
  return (
    <span
      aria-hidden="true"
      className={cn('grid shrink-0 place-items-center rounded-full font-semibold text-white', className)}
      style={{ background: gradient(name || 'fan') }}
    >
      {initials || 'AT'}
    </span>
  )
}

// drawImage paints the first GIF frame and does not keep animating it.
function StillGif({ url, name, className }: { url: string; name: string; className: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let cancel = false
    const img = new Image()
    img.onload = () => {
      if (cancel) return
      const size = Math.max(1, Math.round(canvas.getBoundingClientRect().width) || 48)
      canvas.width = size
      canvas.height = size
      const context = canvas.getContext('2d')
      if (!context) {
        setFailed(true)
        return
      }
      context.drawImage(img, 0, 0, size, size)
    }
    img.onerror = () => {
      if (!cancel) setFailed(true)
    }
    img.src = url
    return () => {
      cancel = true
    }
  }, [url])

  if (failed) return <Initials name={name} className={className} />
  return <canvas ref={canvasRef} className={cn('block shrink-0 rounded-full bg-panel object-cover', className)} aria-hidden="true" />
}

export function Avatar({
  name,
  url,
  size = 'md',
  online = false,
  creator = false,
  premium = false,
}: {
  name: string
  url?: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'call'
  online?: boolean
  creator?: boolean
  premium?: boolean
}) {
  const sizePx = { sm: 40, md: 48, lg: 64, xl: 144, call: 240 }[size]
  const px = { sm: 'h-10 w-10 text-xs', md: 'h-12 w-12 text-sm', lg: 'h-16 w-16 text-lg', xl: 'h-36 w-36 text-3xl', call: 'h-60 w-60 text-4xl' }[size]
  // Creator gets the animated frame; premium users keep the gold ring.
  const gold = !creator && Boolean(premium)
  const ring = gold ? (size === 'xl' || size === 'call' ? 'creator-ring creator-ring-lg' : 'creator-ring') : ''
  const animate = avatarAnimates(url, Boolean(creator), Boolean(premium))
  const face = !url ? (
    <Initials name={name} className={px} />
  ) : animate ? (
    <img src={url} alt="" className={cn('block shrink-0 rounded-full bg-panel object-cover', px)} />
  ) : (
    <StillGif url={url} name={name} className={px} />
  )
  const disc = (
    <span className="relative inline-flex shrink-0">
      <span className={cn('inline-flex overflow-hidden rounded-full shadow-[0_1px_4px_rgb(15_23_42/0.30)]', ring)}>{face}</span>
      {online ? <span className="absolute bottom-0 right-0 z-10 h-3 w-3 rounded-full border-2 border-panel bg-foam" aria-label="Online" /> : null}
    </span>
  )
  return creator ? (
    <CreatorFrame px={sizePx} stacked={size === 'lg' || size === 'xl' || size === 'call'}>
      {disc}
    </CreatorFrame>
  ) : (
    disc
  )
}
