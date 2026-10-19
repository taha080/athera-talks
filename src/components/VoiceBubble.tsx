import { useEffect, useRef, useState } from 'react'
import { formatDuration } from '../lib/format'
import { PauseIcon, PlayIcon } from './Icons'

export function VoiceBubble({
  src,
  seconds,
  waveform,
  mine,
}: {
  src: string | null | undefined
  seconds: number | null | undefined
  waveform: number[] | null | undefined
  mine: boolean
}) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [rate, setRate] = useState(1)
  const bars = waveform && waveform.length > 0 ? waveform.slice(0, 40) : Array.from({ length: 24 }, (_, index) => 30 + ((index * 17) % 50))
  const total = seconds && seconds > 0 ? seconds : 0

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onTime = () => {
      if (!audio.duration || !Number.isFinite(audio.duration)) return
      setProgress(audio.currentTime / audio.duration)
    }
    const onEnd = () => {
      setPlaying(false)
      setProgress(0)
    }
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('ended', onEnd)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('ended', onEnd)
    }
  }, [src])

  async function toggle() {
    const audio = audioRef.current
    if (!audio || !src) return
    if (playing) {
      audio.pause()
      setPlaying(false)
      return
    }
    try {
      audio.playbackRate = rate
      await audio.play()
      setPlaying(true)
    } catch {
      setPlaying(false)
    }
  }

  const elapsed = total > 0 ? Math.round(progress * total) : 0

  return (
    <div className="flex min-w-[200px] items-center gap-2">
      <button
        type="button"
        className={mine ? 'grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/20' : 'grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sakura/15 text-sakura'}
        aria-label={playing ? 'Pause voice message' : 'Play voice message'}
        onClick={() => void toggle()}
        disabled={!src}
      >
        {playing ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex h-8 items-end gap-[3px]" aria-hidden="true">
          {bars.map((height, index) => {
            const active = bars.length > 0 && index / bars.length <= progress
            return (
              <span
                key={`${index}-${height}`}
                className={mine ? 'w-1 rounded-full bg-white' : 'w-1 rounded-full bg-paper'}
                style={{ height: `${Math.max(18, height)}%`, opacity: active || progress === 0 ? 1 : 0.35 }}
              />
            )
          })}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className={mine ? 'text-[11px] text-white/80' : 'text-[11px] text-mist'}>
            {playing ? formatDuration(elapsed) : formatDuration(total)}
          </p>
          <button
            type="button"
            className={mine ? 'rounded-md px-1 text-[11px] font-medium text-white/90' : 'rounded-md px-1 text-[11px] font-medium text-mist'}
            aria-label={`Playback speed ${rate} times`}
            onClick={() => {
              const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1
              setRate(next)
              if (audioRef.current) audioRef.current.playbackRate = next
            }}
          >
            {rate}×
          </button>
        </div>
      </div>
      {src ? <audio ref={audioRef} src={src} preload="metadata" playsInline /> : null}
    </div>
  )
}
