import { APP_NAME } from './brand'
import { callHeadline, type CallPhase } from './callMachine'

// Tab title while a call is in the background: "● 01:23 · Athera Talks".
export function callTabTitle(headline: string): string {
  return `● ${headline} · ${APP_NAME}`
}

export function hiddenCallTitle(phase: CallPhase, connectedAt: number | null, now: number, relay = false): string | null {
  if (phase === 'idle') return null
  const headline = callHeadline(phase, connectedAt, now, relay)
  if (!headline) return null
  return callTabTitle(headline)
}

export type MediaSessionCopy = {
  title: string
  artist: string
  playbackState: 'playing'
}

// Shown to the browser so a live call is treated as playback, not an idle tab.
export function mediaSessionCopy(
  phase: CallPhase,
  username: string | null,
  connectedAt: number | null,
  now: number,
  relay = false,
): MediaSessionCopy | null {
  if (phase === 'idle' || phase === 'failed') return null
  const headline = callHeadline(phase, connectedAt, now, relay)
  const who = username ? `@${username}` : 'Voice call'
  const title = phase === 'connected' && headline ? `${headline} · ${who}` : `Call with ${who}`
  return { title, artist: APP_NAME, playbackState: 'playing' }
}

// A hidden tab must not leave remote audio paused. Speaker mute is separate.
export function shouldResumeCallAudio(phase: CallPhase, audio: { paused: boolean; hasSource: boolean }): boolean {
  if (phase === 'idle' || phase === 'failed') return false
  return audio.paused && audio.hasSource
}
