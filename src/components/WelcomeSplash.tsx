import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type SyntheticEvent } from 'react'
import welcomeVideoUrl from '../assets/welcome-video.mp4'
import {
  markWelcomeShown,
  WELCOME_DURATION_MS,
  WELCOME_FADE_MS,
  welcomeProgress,
  welcomeTitleVisible,
  type WelcomeStorage,
} from '../lib/welcome'

// Full-screen welcome on a fresh open: the user's welcome video plays
// (about 4 seconds), the "ATHERA TALKS" title fades in during the last
// second, then it goes away on its own. On portrait phones the video
// fills the screen; on wide (laptop) screens it is shown whole,
// contained, with a blurred copy filling the sides, so the head and
// fist are never cropped. A tap anywhere, or Skip, dismisses it early. Browsers block autoplay with sound, so the video
// first tries to play with sound; if that is blocked it plays muted
// and a "Tap for sound" button appears instead.

export function WelcomeSplash({ storage, onDone }: { storage: WelcomeStorage | null; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false)
  const [needsTap, setNeedsTap] = useState(false)
  const [progress, setProgress] = useState(0)
  const [showTitle, setShowTitle] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const backdropRef = useRef<HTMLVideoElement | null>(null)
  const doneRef = useRef(false)
  const finishTimerRef = useRef<number | null>(null)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  function finish() {
    if (doneRef.current) return
    doneRef.current = true
    if (finishTimerRef.current !== null) window.clearTimeout(finishTimerRef.current)
    videoRef.current?.pause()
    onDoneRef.current()
  }

  function dismissWithFade() {
    if (doneRef.current) return
    setLeaving(true)
    finishTimerRef.current = window.setTimeout(finish, WELCOME_FADE_MS)
  }

  useEffect(() => {
    markWelcomeShown(storage)
    const video = videoRef.current
    if (!video) return
    // The blurred backdrop copy plays muted on a loop, so it can
    // autoplay anywhere; a rejection here is harmless.
    void backdropRef.current?.play().catch(() => {})
    // Try with sound first. A rejection means the browser blocked
    // autoplay with sound, so fall back to muted playback and offer
    // the tap button.
    video.muted = false
    void video.play().catch(() => {
      if (doneRef.current) return
      video.muted = true
      setNeedsTap(true)
      void video.play().catch(() => {
        // Even muted playback failed: the safety timer below still
        // dismisses the splash, so the user is never stuck on it.
      })
    })
    // Safety net in case the video stalls or its ended event never
    // fires: never hold the splash longer than the video plus a beat.
    const safetyTimer = window.setTimeout(dismissWithFade, WELCOME_DURATION_MS + 1000)
    return () => {
      window.clearTimeout(safetyTimer)
      if (finishTimerRef.current !== null) window.clearTimeout(finishTimerRef.current)
      video.pause()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storage])

  function onTimeUpdate(event: SyntheticEvent<HTMLVideoElement>) {
    const video = event.currentTarget
    setProgress(welcomeProgress(video.currentTime, video.duration))
    setShowTitle(welcomeTitleVisible(video.currentTime, video.duration))
  }

  function playSound(event: ReactMouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    const video = videoRef.current
    if (!video) return
    video.muted = false
    void video.play().then(
      () => setNeedsTap(false),
      () => setNeedsTap(true),
    )
  }

  return (
    <div
      className={`welcome-splash${leaving ? ' is-leaving' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Athera Talks"
      onClick={finish}
    >
      {/* Blurred copy of the same video behind the main one. It is
          hidden on portrait phones (the main video already fills the
          screen there) and only shows on wide screens, where the main
          video is contained instead of cropped — see index.css. */}
      <video
        ref={backdropRef}
        className="welcome-backdrop"
        src={welcomeVideoUrl}
        muted
        loop
        playsInline
        autoPlay
        preload="auto"
        aria-hidden="true"
        tabIndex={-1}
      />
      <video
        ref={videoRef}
        className="welcome-video"
        src={welcomeVideoUrl}
        playsInline
        preload="auto"
        aria-hidden="true"
        onTimeUpdate={onTimeUpdate}
        onEnded={dismissWithFade}
      />
      <div className={`welcome-brand${showTitle ? ' is-visible' : ''}`} aria-hidden="true">
        ATHERA TALKS
      </div>
      <div className="welcome-progress" aria-hidden="true">
        <span style={{ width: `${progress * 100}%` }} />
      </div>
      {needsTap ? (
        <button type="button" className="welcome-sound" onClick={playSound}>
          Tap for sound
        </button>
      ) : null}
      <button type="button" className="welcome-skip" onClick={finish}>
        Skip
      </button>
    </div>
  )
}
