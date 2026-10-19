import { useEffect, useState, type ReactNode } from 'react'
import { useCall } from '../context/CallContext'
import { formatDuration } from '../lib/format'
import { Avatar } from './Avatar'
import { EndIcon, MicIcon, PhoneIcon } from './Icons'

export function CallScreen() {
  const call = useCall()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (call.phase !== 'connected') return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [call.phase])

  if (call.phase === 'idle') {
    return call.banner ? (
      <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
        <p className="rounded-full bg-elevated px-4 py-2 text-sm shadow-lg">{call.banner}</p>
      </div>
    ) : null
  }

  const peer = call.peer
  const seconds = call.startedAt ? Math.floor((now - call.startedAt) / 1000) : 0
  const status =
    call.phase === 'incoming' || call.phase === 'ringing'
      ? 'Ringing…'
      : call.phase === 'outgoing'
        ? 'Calling…'
        : call.phase === 'connecting'
          ? 'Connecting…'
          : call.phase === 'failed'
            ? 'Call failed'
            : call.demo
              ? 'Demo call'
              : 'Connected'

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-ink/95 px-6 py-10 text-center backdrop-blur-md" role="dialog" aria-label="Voice call">
      <p className="text-xs uppercase tracking-[0.22em] text-mist">{status}</p>
      <div>
        <div className="relative mx-auto grid h-40 w-40 place-items-center">
          {call.phase !== 'connected' && call.phase !== 'failed' ? (
            <span className="absolute inset-0 animate-ping rounded-full bg-sakura/20" />
          ) : null}
          <Avatar name={peer?.username ?? 'fan'} url={peer?.avatarUrl} size="xl" />
        </div>
        <h2 className="mt-6 text-3xl font-semibold">@{peer?.username}</h2>
        <p className="mt-2 text-sm text-mist">{peer?.favouriteAnime ?? 'Anime fan'}</p>
        <p className="mt-6 text-4xl font-semibold tabular-nums">
          {call.phase === 'connected' ? formatDuration(seconds) : '0:00'}
        </p>
        {call.error ? <p className="mx-auto mt-4 max-w-sm text-sm text-sakura">{call.error}</p> : null}
        {call.debug ? (
          <p className="mt-3 font-mono text-[11px] tracking-wide text-mist" data-testid="call-debug">
            {call.debug}
          </p>
        ) : null}
        {call.demo && call.phase === 'connected' ? (
          <p className="mt-3 text-xs text-mist">This preview does not use your microphone.</p>
        ) : null}
      </div>

      <div className="flex items-center gap-6 pb-4">
        {call.phase === 'incoming' ? (
          <>
            <RoundButton label="Decline" tone="danger" onClick={() => void call.reject()}>
              <EndIcon className="h-7 w-7" />
            </RoundButton>
            <RoundButton label="Accept" tone="good" onClick={() => void call.accept()}>
              <PhoneIcon className="h-7 w-7" />
            </RoundButton>
          </>
        ) : call.phase === 'failed' ? (
          <RoundButton label="Close" tone="danger" onClick={() => void call.hangup()}>
            <EndIcon className="h-7 w-7" />
          </RoundButton>
        ) : (
          <>
            <RoundButton label={call.muted ? 'Unmute' : 'Mute'} tone="ghost" pressed={call.muted} onClick={call.toggleMute}>
              <MicIcon className="h-7 w-7" off={call.muted} />
            </RoundButton>
            <RoundButton label="End call" tone="danger" onClick={() => void call.hangup()}>
              <EndIcon className="h-7 w-7" />
            </RoundButton>
          </>
        )}
      </div>
    </div>
  )
}

function RoundButton({
  label,
  tone,
  pressed,
  onClick,
  children,
}: {
  label: string
  tone: 'danger' | 'good' | 'ghost'
  pressed?: boolean
  onClick: () => void
  children: ReactNode
}) {
  const toneClass =
    tone === 'danger' ? 'bg-sakura text-white' : tone === 'good' ? 'bg-foam text-ink' : 'bg-white/10 text-paper'
  return (
    <button type="button" onClick={onClick} aria-pressed={pressed} className="grid justify-items-center gap-2 text-xs text-mist">
      <span className={`grid h-16 w-16 place-items-center rounded-full ${toneClass}`}>{children}</span>
      {label}
    </button>
  )
}
