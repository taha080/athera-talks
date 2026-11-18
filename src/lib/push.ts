// The real Supabase queries live in pushBackend.ts; this file owns the
// browser side (permission, subscription, service worker).
import { PushNotReadyError, hasPushSubscription, removePushSubscription, savePushSubscription } from '../services/pushBackend'

// Web Push for message notifications: the part that runs in the browser.
//
// When a message arrives while Athera Talks is closed, the browser's push
// service wakes the service worker (public/sw.js), which shows the
// notification. That only works if this device subscribed first: the
// browser creates a push subscription, and we store its endpoint and
// encryption keys in the push_subscriptions table (see
// supabase/migrations/20261116120000_push_subscriptions.sql). The
// send-push Edge Function reads that table when a message is inserted.
//
// The VAPID public key below is public by design — it only identifies
// this app to the push service. The matching private key is a Supabase
// Edge Function secret (VAPID_PRIVATE_KEY) and must never appear in this
// repo. If the key ever leaks or needs rotating, generate a new pair and
// update both this constant and the secret; old subscriptions stop
// working and each device re-subscribes from Settings.
export const PUSH_VAPID_PUBLIC_KEY =
  'BBRej1SdTlMGrH4pB3JoFZBsrUmsPXx6XtsOyulnNl0Z1tir7Lg9twnbcqMFVsWGEU2LeTTR8AtO3OlOa5tIJxs'

export const PUSH_SERVICE_WORKER_URL = 'sw.js'

export type PushState = 'unsupported' | 'unavailable' | 'denied' | 'off' | 'on'

export type PushPayload = {
  title: string
  body: string
  conversationId: string
  messageId: string
  // Total unread for the recipient, when the Edge Function could count it.
  // Absent when it could not — the service worker then shows a plain dot.
  unreadCount?: number
}

// The same shape the service worker parses in public/sw.js. Keep the two
// in step if the payload ever changes.
export function parsePushPayload(data: unknown): PushPayload | null {
  if (!data || typeof data !== 'object') return null
  const record = data as Record<string, unknown>
  const title = typeof record.title === 'string' && record.title ? record.title : 'Athera Talks'
  const body = typeof record.body === 'string' ? record.body : ''
  const conversationId = typeof record.conversationId === 'string' ? record.conversationId : ''
  const messageId = typeof record.messageId === 'string' ? record.messageId : ''
  if (!conversationId && !body) return null
  const payload: PushPayload = { title, body, conversationId, messageId }
  if (
    typeof record.unreadCount === 'number' &&
    Number.isFinite(record.unreadCount) &&
    record.unreadCount >= 0
  ) {
    payload.unreadCount = Math.floor(record.unreadCount)
  }
  return payload
}

export function pushSupported(): boolean {
  if (typeof window === 'undefined') return false
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    window.isSecureContext === true
  )
}

export function pushStateNote(state: PushState): string {
  if (state === 'unsupported') return 'This browser does not support push notifications.'
  if (state === 'denied') return 'Notifications are blocked for this site in the browser settings.'
  if (state === 'unavailable')
    return 'Push notifications are not set up yet — run supabase/migrations/20261116120000_push_subscriptions.sql in Supabase first.'
  if (state === 'on') return 'On for this device. You will be notified even when Athera Talks is closed.'
  return 'Off for this device.'
}

// PushSubscription keys come back base64url-encoded. The subscribe call
// needs the VAPID public key as bytes.
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const decoded = atob(base64.replace(/-/g, '+').replace(/_/g, '/') + padding)
  const bytes = new Uint8Array(decoded.length)
  for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i)
  return bytes
}

function browserName(userAgent: string): string {
  if (/Edg\//.test(userAgent)) return 'Edge'
  if (/OPR\//.test(userAgent) || /Opera/.test(userAgent)) return 'Opera'
  if (/Chrome\//.test(userAgent)) return 'Chrome'
  if (/Firefox\//.test(userAgent)) return 'Firefox'
  if (/Safari\//.test(userAgent)) return 'Safari'
  return 'Browser'
}

// A short human label for the subscription row, so the user can tell
// their devices apart. Only the browser and the OS family, never the
// full user-agent string.
export function deviceLabel(userAgent: string): string {
  const browser = browserName(userAgent)
  if (/iPhone/.test(userAgent)) return `iPhone · ${browser}`
  if (/iPad/.test(userAgent)) return `iPad · ${browser}`
  if (/Android/.test(userAgent)) return `Android · ${browser}`
  if (/Windows/.test(userAgent)) return `Windows · ${browser}`
  if (/Macintosh/.test(userAgent)) return `Mac · ${browser}`
  if (/Linux/.test(userAgent)) return `Linux · ${browser}`
  return browser
}

async function registerWorker(): Promise<ServiceWorkerRegistration> {
  const base = import.meta.env.BASE_URL || '/'
  const url = `${base}${PUSH_SERVICE_WORKER_URL}`
  return navigator.serviceWorker.register(url, { scope: base })
}

async function existingSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}

export async function getPushState(userId: string): Promise<{ state: PushState; device: string }> {
  const device = deviceLabel(navigator.userAgent)
  if (!pushSupported()) return { state: 'unsupported', device }
  if (Notification.permission === 'denied') return { state: 'denied', device }
  try {
    const registration = await registerWorker()
    const subscription = await registration.pushManager.getSubscription()
    if (!subscription) return { state: 'off', device }
    const saved = await hasPushSubscription(userId, subscription.endpoint)
    if (saved) return { state: 'on', device }
    // The browser is subscribed but the row is gone (or was never saved).
    // Re-save it quietly; if the table is missing the feature is off.
    await savePushSubscription(userId, subscription, device)
    return { state: 'on', device }
  } catch (error) {
    if (error instanceof PushNotReadyError) return { state: 'unavailable', device }
    return { state: 'off', device }
  }
}

// Called from the Settings toggle, so this runs on a user gesture — the
// browser only allows the permission prompt from one.
export async function enablePushNotifications(userId: string): Promise<PushState> {
  if (!pushSupported()) return 'unsupported'
  const registration = await registerWorker()
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(PUSH_VAPID_PUBLIC_KEY),
  })
  try {
    await savePushSubscription(userId, subscription, deviceLabel(navigator.userAgent))
    return 'on'
  } catch (error) {
    // The table is not set up: drop the useless subscription again so
    // the next attempt starts clean.
    if (error instanceof PushNotReadyError) {
      await subscription.unsubscribe().catch(() => undefined)
      return 'unavailable'
    }
    throw error
  }
}

export async function disablePushNotifications(): Promise<void> {
  try {
    const subscription = await existingSubscription()
    if (!subscription) return
    const endpoint = subscription.endpoint
    await subscription.unsubscribe().catch(() => undefined)
    await removePushSubscription(endpoint).catch(() => undefined)
  } catch {
    // Turning off must never break the page.
  }
}

// Best-effort re-save of an existing browser subscription, used on sign-in
// so a subscription is not lost when its row was deleted. Never throws.
export async function syncPushSubscription(userId: string): Promise<void> {
  if (!pushSupported() || Notification.permission !== 'granted') return
  try {
    const registration = await registerWorker()
    const subscription = await registration.pushManager.getSubscription()
    if (!subscription) return
    await savePushSubscription(userId, subscription, deviceLabel(navigator.userAgent))
  } catch {
    // Missing table, no network, or anything else: push stays off.
  }
}
