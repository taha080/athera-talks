import { useEffect, useState, type ReactNode } from 'react'
import { useCall } from '../context/CallContext'
import { formatDuration } from '../lib/format'
import { Avatar } from './Avatar'
import { EndIcon, MicIcon, PhoneIcon, VolumeIcon } from './Icons'

export function CallScreen() {
  const call = useCall()
  const [now, setNow] = useState(() => Date.now())
  const [details, setDetails] = useState(false)

  useEffect(() => {
    if (call.phase !== 'connected') return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [call.phase])

  useEffect(() => {
    setDetails(false)
  }, [call.phase])

  if (call.phase === 'idle') {
    return call.banner ? (
      <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
        <p className="rounded-lg border border-line bg-panel px-4 py-2 text-sm shadow-md">{call.banner}</p>
      </div>
    ) : null
  }

  const peer = call.peer
  const seconds = call.startedAt ? Math.floor((now - call.startedAt) / 1000) : 0
  const status =
    call.phase === 'incoming' || call.phase === 'ringing'
      ? 'Incoming call'
      : call.phase === 'outgoing'
        ? 'Calling…'
        : call.phase === 'connecting'
          ? 'Connecting…'
          : call.phase === 'failed'
            ? 'Call failed'
            : 'Connected'

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-ink px-6 py-10 text-center" role="dialog" aria-modal="true" aria-label="Voice call">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-mist">{status}</p>
      <div>
        <div className="relative mx-auto grid h-44 w-44 place-items-center">
          {call.phase !== 'connected' && call.phase !== 'failed' ? (
            <span className="absolute inset-4 animate-ping rounded-full bg-sakura/20" />
          ) : null}
          <Avatar name={peer?.username ?? 'caller'} url={peer?.avatarUrl} size="xl" />
        </div>
        <h2 className="mt-6 text-3xl font-semibold tracking-tight">@{peer?.username}</h2>
        <p className="mt-6 text-4xl font-semibold tabular-nums">{call.phase === 'connected' ? formatDuration(seconds) : '0:00'}</p>
        {call.error ? <p className="mx-auto mt-4 max-w-sm text-sm text-danger">{call.error}</p> : null}
        {call.demo && call.phase === 'connected' ? (
          <p className="mt-3 text-xs text-mist">Preview only. Your microphone stays off.</p>
        ) : null}
        <button
          type="button"
          className="mt-4 text-xs font-medium text-mist underline-offset-2 hover:underline"
          aria-expanded={details}
          onClick={() => setDetails((open) => !open)}
        >
          Details
        </button>
        {details ? (
          <p className="mt-2 font-mono text-[11px] tracking-wide text-mist" data-testid="call-debug">
            {call.debug || 'No connection details yet.'}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-6 pb-4">
        {call.phase === 'incoming' ? (
          <>
            <RoundButton label="Decline" tone="danger" onClick={() => void call.reject()}>
              <EndIcon className="h-6 w-6" />
            </RoundButton>
            <RoundButton label="Accept" tone="good" onClick={() => void call.accept()}>
              <PhoneIcon className="h-6 w-6" />
            </RoundButton>
          </>
        ) : call.phase === 'failed' ? (
          <RoundButton label="Close" tone="danger" onClick={() => void call.hangup()}>
            <EndIcon className="h-6 w-6" />
          </RoundButton>
        ) : (
          <>
            <RoundButton label={call.muted ? 'Unmute' : 'Mute'} tone="ghost" pressed={call.muted} onClick={call.toggleMute}>
              <MicIcon className="h-6 w-6" off={call.muted} />
            </RoundButton>
            <RoundButton label={call.speakerOn ? 'Speaker' : 'Speaker off'} tone="ghost" pressed={!call.speakerOn} onClick={call.toggleSpeaker}>
              <VolumeIcon className="h-6 w-6" off={!call.speakerOn} />
            </RoundButton>
            <RoundButton label="End" tone="danger" onClick={() => void call.hangup()}>
              <EndIcon className="h-6 w-6" />
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
    tone === 'danger'
      ? 'bg-[#e5484d] text-white'
      : tone === 'good'
        ? 'bg-foam text-ink'
        : pressed
          ? 'bg-white/15 text-paper'
          : 'bg-white/10 text-paper'
  return (
    <button type="button" onClick={onClick} aria-pressed={pressed} className="grid justify-items-center gap-2 text-xs text-mist">
      <span className={`grid h-14 w-14 place-items-center rounded-full transition ${toneClass}`}>{children}</span>
      {label}
    </button>
  )
}
