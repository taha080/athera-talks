import { useEffect, useState, type ReactNode } from 'react'
import { useCall } from '../context/CallContext'
import { callHeadline, RELAY_RETRY_STATUS } from '../lib/callMachine'
import { cn } from '../lib/cn'
import { useCallClock } from '../lib/useCallClock'
import { Avatar } from './Avatar'
import { DisplayName } from './CreatorBadge'
import { EndIcon, MicIcon, PhoneIcon, VolumeIcon } from './Icons'

export function ReturnToCallBar() {
  const call = useCall()
  const timing = call.phase === 'connected' && call.connectedAt != null
  const now = useCallClock(!call.expanded && timing, call.connectedAt)
  if (call.phase === 'idle' || call.expanded) return null
  const headline = callHeadline(call.phase, call.connectedAt, now, call.relaying)
  return (
    <div className="shrink-0 border-b border-line bg-panel">
      <button
        type="button"
        onClick={call.expand}
        data-testid="return-to-call"
        className="flex h-8 w-full items-center justify-center gap-2 text-[13px] text-paper"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-foam" aria-hidden="true" />
        <span className="font-medium">Return to call</span>
        <span className="tabular-nums text-mist" data-testid="return-call-clock">
          {headline}
        </span>
      </button>
    </div>
  )
}

export function CallScreen() {
  const call = useCall()
  const timing = call.phase === 'connected' && call.connectedAt != null
  const now = useCallClock(call.expanded && timing, call.connectedAt)
  const [details, setDetails] = useState(false)

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

  if (!call.expanded) return null

  const peer = call.peer
  const headline = callHeadline(call.phase, call.connectedAt, now, call.relaying)
  const showClock = call.phase === 'connected'
  const relayNotice = headline === RELAY_RETRY_STATUS

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-ink px-6 py-10 text-center" role="dialog" aria-modal="true" aria-label="Voice call">
      <div className="flex w-full flex-col items-center gap-3">
        {call.phase !== 'incoming' ? (
          <button
            type="button"
            onClick={call.minimize}
            data-testid="leave-call-screen"
            className="self-start text-xs font-medium text-mist"
          >
            Back to chats
          </button>
        ) : null}
        <p
          className={cn(
            showClock
              ? 'text-3xl font-semibold tabular-nums tracking-normal text-paper'
              : relayNotice
                ? 'max-w-sm text-sm font-medium normal-case tracking-normal text-paper'
                : 'text-xs font-medium uppercase tracking-[0.16em] text-mist',
          )}
          data-testid="call-status"
        >
          {headline}
        </p>
      </div>
      <div>
        <div className="relative mx-auto grid h-44 w-44 place-items-center">
          {call.phase !== 'connected' && call.phase !== 'failed' ? (
            <span className="absolute inset-4 animate-ping rounded-full bg-sakura/20" />
          ) : null}
          <Avatar name={peer?.username ?? 'caller'} url={peer?.avatarUrl} size="xl" />
        </div>
        <h2 className="mt-6 flex items-center justify-center gap-1.5 text-3xl font-semibold tracking-tight">
          <DisplayName name={`@${peer?.username ?? 'caller'}`} creator={peer?.isCreator} />
        </h2>
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
