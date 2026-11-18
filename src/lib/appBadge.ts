// Launcher icon badge (Badging API — navigator.setAppBadge).
//
// Mirrors the in-app unread total onto the installed app's launcher icon
// (on Android, Chrome shows the number on the PWA icon, like other
// apps). The badge only appears for the *installed* app, never for a
// plain browser tab, and only in browsers that support the API (Chrome
// and Edge on Android/desktop; Safari does not).
//
// Everything here is best-effort and feature-detected: on an unsupported
// browser every call is a silent no-op, and a rejected promise never
// throws to the caller.

export function appBadgeSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'setAppBadge' in navigator &&
    typeof navigator.setAppBadge === 'function'
  )
}

export function setAppBadge(count: number): void {
  if (count <= 0) {
    clearAppBadge()
    return
  }
  if (!appBadgeSupported()) return
  try {
    void navigator.setAppBadge(Math.floor(count)).catch(() => undefined)
  } catch {
    // Badge is cosmetic; never break the app for it.
  }
}

export function clearAppBadge(): void {
  if (
    typeof navigator === 'undefined' ||
    !('clearAppBadge' in navigator) ||
    typeof navigator.clearAppBadge !== 'function'
  ) {
    return
  }
  try {
    void navigator.clearAppBadge().catch(() => undefined)
  } catch {
    // Badge is cosmetic; never break the app for it.
  }
}

/** Set the launcher badge to the total unread count, or clear it at zero. */
export function syncAppBadge(totalUnread: number): void {
  if (totalUnread > 0) setAppBadge(totalUnread)
  else clearAppBadge()
}
