import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'

// Elapsed time is always Date.now() - connectedAt. The timeout only asks for a
// repaint; hiding or blurring the tab does not clear it. visibilitychange,
// focus, and pageshow paint the true elapsed time before the next frame.
export function useCallClock(running: boolean, connectedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!running || connectedAt == null) return
    let timer = 0
    const tick = () => {
      const elapsed = Date.now() - connectedAt
      setNow(Date.now())
      timer = window.setTimeout(tick, 1000 - (elapsed % 1000))
    }
    const reveal = () => {
      flushSync(() => setNow(Date.now()))
    }
    tick()
    document.addEventListener('visibilitychange', reveal)
    window.addEventListener('focus', reveal)
    window.addEventListener('pageshow', reveal)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', reveal)
      window.removeEventListener('focus', reveal)
      window.removeEventListener('pageshow', reveal)
    }
  }, [running, connectedAt])

  // The stored timestamp is the source of truth. A render always shows the
  // elapsed time at this instant, including the first paint after a background gap.
  return running && connectedAt != null ? Date.now() : now
}
