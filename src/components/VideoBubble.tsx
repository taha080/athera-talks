import { useRef, useState } from 'react'
import { formatCallClock, formatDuration } from '../lib/format'
import { PlayIcon } from './Icons'

export function VideoBubble({ src, seconds }: { src: string; seconds?: number | null }) {
  const node = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const length = seconds != null && Number.isFinite(seconds) && seconds >= 0 ? (seconds >= 3600 ? formatCallClock(seconds) : formatDuration(seconds)) : null

  function play() {
    const video = node.current
    if (!video) return
    setPlaying(true)
    void video.play()
  }

  async function fullscreen() {
    const video = node.current
    if (!video) return
    setPlaying(true)
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        return
      }
      await video.requestFullscreen()
      await video.play()
    } catch {
      await video.play().catch(() => undefined)
    }
  }

  return (
    <div className="relative" data-video-message="true">
      <video
        ref={node}
        src={src}
        preload="metadata"
        playsInline
        controls={playing}
        className="max-h-72 w-full rounded-[14px] bg-black object-contain"
        onLoadedMetadata={(event) => {
          const video = event.currentTarget
          if (playing || video.currentTime > 0) return
          if (!Number.isFinite(video.duration) || video.duration <= 0) return
          try {
            video.currentTime = Math.min(0.1, video.duration)
          } catch {
            // A failed seek still leaves the first frame for the poster.
          }
        }}
        onPlay={() => setPlaying(true)}
      />
      {playing ? (
        <button
          type="button"
          className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-1 text-xs font-medium text-white"
          aria-label="Full screen"
          onClick={() => void fullscreen()}
        >
          Full screen
        </button>
      ) : (
        <button type="button" className="absolute inset-0 grid place-items-center" aria-label="Play video" onClick={play}>
          <span className="grid h-12 w-12 place-items-center rounded-full bg-black/60 text-white">
            <PlayIcon className="h-6 w-6" />
          </span>
          {length ? <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-1.5 py-0.5 text-[11px] text-white">{length}</span> : null}
        </button>
      )}
    </div>
  )
}
