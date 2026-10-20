import { useEffect, useRef, useState } from 'react'
import { cn } from '../lib/cn'
import { avatarAnimates } from '../lib/premium'

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
  const px = { sm: 'h-10 w-10 text-xs', md: 'h-12 w-12 text-sm', lg: 'h-16 w-16 text-lg', xl: 'h-36 w-36 text-3xl', call: 'h-60 w-60 text-4xl' }[size]
  const gold = Boolean(creator || premium)
  const ring = gold ? (size === 'xl' || size === 'call' ? 'creator-ring creator-ring-lg' : 'creator-ring') : ''
  const animate = avatarAnimates(url, Boolean(creator), Boolean(premium))
  const face = !url ? (
    <Initials name={name} className={px} />
  ) : animate ? (
    <img src={url} alt="" className={cn('block shrink-0 rounded-full bg-panel object-cover', px)} />
  ) : (
    <StillGif url={url} name={name} className={px} />
  )
  return (
    <span className="relative inline-flex shrink-0">
      <span className={cn('inline-flex overflow-hidden rounded-full', ring)}>{face}</span>
      {online ? <span className="absolute bottom-0 right-0 z-10 h-3 w-3 rounded-full border-2 border-panel bg-foam" aria-label="Online" /> : null}
    </span>
  )
}
