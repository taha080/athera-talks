// Athera Talks push service worker.
//
// This file is served as-is from public/ (Vite copies it to dist/) and is
// registered by the app only for signed-in users, only where the browser
// supports service workers and Web Push. It does NOT cache anything and
// has no fetch handler, so it cannot break navigation or the app itself.
//
// What it does:
//  * `push` — a message arrived while the app is closed (or in the
//    background). Show a notification with the sender's name and a short
//    preview. If a tab is already open on that conversation and visible,
//    stay quiet — the chat is already on screen.
//  * `notificationclick` — focus the tab that already has the chat open,
//    or open it on that conversation.
//
// The payload the send-push Edge Function sends is JSON:
//   { "title": "sender name", "body": "short preview",
//     "conversationId": "<uuid>", "messageId": "<uuid>",
//     "unreadCount": 3 }
// `unreadCount` is the recipient's total unread count (absent when the
// Edge Function could not count it). The same shape is parsed by
// parsePushPayload() in src/lib/push.ts; keep the two in step if the
// payload ever changes.
//
// The badge: when a push arrives, the launcher icon badge is set to the
// total unread count (or a plain dot when no count was sent). The app
// itself re-syncs the badge from its own unread total whenever it is
// open, so the worker's badge is only a stand-in for when the app is
// closed. Badge work is best-effort and never breaks the notification.

function pushTarget(event) {
  try {
    const data = event.data ? event.data.json() : null
    if (!data || typeof data !== 'object') return null
    const title = typeof data.title === 'string' && data.title ? data.title : 'Athera Talks'
    const body = typeof data.body === 'string' ? data.body : ''
    const conversationId = typeof data.conversationId === 'string' ? data.conversationId : ''
    const unreadCount =
      typeof data.unreadCount === 'number' && Number.isFinite(data.unreadCount) && data.unreadCount >= 0
        ? Math.floor(data.unreadCount)
        : null
    return { title, body, conversationId, unreadCount }
  } catch {
    return null
  }
}

// Set the launcher icon badge for this push: the total unread count when
// the payload carries one, a plain dot when it does not, and clear it
// when the count is zero. Never throws — a badge failure must not break
// the notification.
async function setIconBadge(unreadCount) {
  if (typeof navigator === 'undefined' || !('setAppBadge' in navigator)) return
  try {
    if (unreadCount === null) {
      await navigator.setAppBadge()
    } else if (unreadCount > 0) {
      await navigator.setAppBadge(unreadCount)
    } else if ('clearAppBadge' in navigator) {
      await navigator.clearAppBadge()
    }
  } catch {
    // Badge is cosmetic; ignore.
  }
}

self.addEventListener('push', (event) => {
  const target = pushTarget(event)
  if (!target) return
  event.waitUntil(
    (async () => {
      // Already looking at this chat? Then no notification is needed.
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const alreadyOpen = clients.some(
        (client) =>
          client.visibilityState === 'visible' &&
          target.conversationId &&
          client.url.includes(`/c/${target.conversationId}`),
      )
      if (alreadyOpen) return
      await setIconBadge(target.unreadCount)
      const url = target.conversationId ? `c/${target.conversationId}` : ''
      await self.registration.showNotification(target.title, {
        body: target.body || 'New message',
        icon: new URL('icon-192.png', self.registration.scope).toString(),
        badge: new URL('icon-192.png', self.registration.scope).toString(),
        tag: target.conversationId ? `chat:${target.conversationId}` : 'chat',
        renotify: true,
        data: { url },
      })
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data && event.notification.data.url
    ? new URL(event.notification.data.url, self.registration.scope).toString()
    : new URL('', self.registration.scope).toString()
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of clients) {
        if (client.url === url) {
          await client.focus()
          return
        }
      }
      for (const client of clients) {
        if ('focus' in client) {
          await client.focus()
          await client.navigate(url)
          return
        }
      }
      await self.clients.openWindow(url)
    })(),
  )
})
