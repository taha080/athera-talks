/** Welcome splash: shows once per browser tab session, on a fresh open
 *  after the app was closed — never on in-app navigation, and never for
 *  people who prefer reduced motion. sessionStorage is per tab and is
 *  cleared when the tab closes, which is exactly that boundary. */

export const WELCOME_SEEN_KEY = 'tatalk:welcome-shown'

/** The splash plays the welcome video (about 4 seconds) and dismisses
 *  itself when the video ends. */
export const WELCOME_DURATION_MS = 4000

/** Fade-out at the end of the splash, in milliseconds. */
export const WELCOME_FADE_MS = 220

/** How early the "ATHERA TALKS" title fades in, before the video ends. */
export const WELCOME_TITLE_LEAD_MS = 1000

export type WelcomeStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

export function shouldShowWelcome(storage: WelcomeStorage | null | undefined, prefersReducedMotion: boolean): boolean {
  if (prefersReducedMotion) return false
  if (!storage) return false
  try {
    return storage.getItem(WELCOME_SEEN_KEY) !== '1'
  } catch {
    // Storage blocked: never show, rather than showing on every open.
    return false
  }
}

export function markWelcomeShown(storage: WelcomeStorage | null | undefined): void {
  if (!storage) return
  try {
    storage.setItem(WELCOME_SEEN_KEY, '1')
  } catch {
    // A browser that blocks storage still gets the app; the splash just
    // shows again next time.
  }
}

/** Progress of the video as a 0..1 fraction, for the progress bar. */
export function welcomeProgress(currentTimeSeconds: number, durationSeconds: number): number {
  if (!Number.isFinite(currentTimeSeconds) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0
  return Math.min(1, Math.max(0, currentTimeSeconds / durationSeconds))
}

/** True once the video is inside its final stretch, when the title
 *  overlay should be visible. */
export function welcomeTitleVisible(currentTimeSeconds: number, durationSeconds: number): boolean {
  if (!Number.isFinite(currentTimeSeconds) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return false
  return durationSeconds - currentTimeSeconds <= WELCOME_TITLE_LEAD_MS / 1000
}

export function reducedMotionPreferred(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
