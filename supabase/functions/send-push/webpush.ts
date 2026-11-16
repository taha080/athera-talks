// Web Push sending with only the Web Crypto API — no npm dependencies.
// Implements RFC 8292 (VAPID) and RFC 8291 (aes128gcm content encoding),
// so this file runs on Supabase Edge Functions (Deno) unchanged.
//
// The construction, step by step (matching the reference web-push
// library, which is the tested behaviour browsers expect):
//  1. Ephemeral P-256 ECDH key pair; shared secret = ECDH(ephemeral
//     private, subscriber public).
//  2. PRK = HKDF(salt = the subscription's auth secret,
//     IKM = shared secret, info = "WebPush: info" || 0x00 ||
//     subscriber public || ephemeral public, 32 bytes).
//  3. CEK = HKDF(salt = 16 random bytes, IKM = PRK,
//     info = "Content-Encoding: aes128gcm" || 0x00, 16 bytes).
//  4. Nonce = HKDF(same salt, PRK, "Content-Encoding: nonce" || 0x00,
//     12 bytes).
//  5. Ciphertext = AES-128-GCM(plaintext || 0x02 delimiter).
//  6. Body = salt (16) || record size (4, big-endian, 4096) || key
//     length (1, 65) || ephemeral public key (65) || ciphertext.
// VAPID is a short-lived ES256 JWT signed with the app's VAPID private
// key, sent as `Authorization: vapid t=<jwt>, k=<public key>`.

export type PushSubscriptionKeys = {
  endpoint: string
  p256dh: string
  auth: string
}

export type VapidKeys = {
  publicKey: string // base64url, 65-byte uncompressed P-256 point
  privateKey: string // base64url, 32-byte P-256 scalar
}

const textEncoder = new TextEncoder()

export function base64UrlEncode(data: Uint8Array): string {
  let binary = ''
  for (const byte of data) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function base64UrlDecode(input: string): Uint8Array {
  const padding = '='.repeat((4 - (input.length % 4)) % 4)
  const decoded = atob(input.replace(/-/g, '+').replace(/_/g, '/') + padding)
  const bytes = new Uint8Array(decoded.length)
  for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i)
  return bytes
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    length * 8,
  )
  return new Uint8Array(bits)
}

// WebCrypto returns ECDSA signatures DER-encoded in browsers and Deno
// (the spec behaviour). Node's WebCrypto is the odd one out and returns
// the raw 64-byte R||S form. A DER P-256 signature is 70–72 bytes, a raw
// one is exactly 64, so the length tells them apart — accept both, so
// this code is correct on Deno and testable under Node.
export function ecdsaSignatureToRaw(signature: Uint8Array): Uint8Array {
  if (signature.length === 64) return signature
  return derToRawSignature(signature)
}

// DER form: 0x30 LEN 0x02 LEN_R R 0x02 LEN_S S. Exported for tests.
export function derToRawSignature(der: Uint8Array): Uint8Array {
  let offset = 0
  if (der[offset++] !== 0x30) throw new Error('Invalid ECDSA signature.')
  let length = der[offset++]
  if (length & 0x80) {
    const bytes = length & 0x7f
    length = 0
    for (let i = 0; i < bytes; i++) length = (length << 8) | der[offset++]
  }
  if (der[offset++] !== 0x02) throw new Error('Invalid ECDSA signature.')
  const rLength = der[offset++]
  let r = der.slice(offset, offset + rLength)
  offset += rLength
  if (der[offset++] !== 0x02) throw new Error('Invalid ECDSA signature.')
  const sLength = der[offset++]
  let s = der.slice(offset, offset + sLength)
  // A leading zero byte only keeps the integer positive; drop it.
  if (r.length === 33 && r[0] === 0) r = r.slice(1)
  if (s.length === 33 && s[0] === 0) s = s.slice(1)
  if (r.length > 32 || s.length > 32) throw new Error('Invalid ECDSA signature.')
  const out = new Uint8Array(64)
  out.set(r, 32 - r.length)
  out.set(s, 64 - s.length)
  return out
}

function vapidPoint(publicKey: string): { x: Uint8Array; y: Uint8Array } {
  const raw = base64UrlDecode(publicKey)
  if (raw.length !== 65 || raw[0] !== 0x04) throw new Error('VAPID public key must be a 65-byte uncompressed point.')
  return { x: raw.slice(1, 33), y: raw.slice(33, 65) }
}

export async function vapidAuthorization(audience: string, subject: string, keys: VapidKeys): Promise<string> {
  const { x, y } = vapidPoint(keys.publicKey)
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x: base64UrlEncode(x), y: base64UrlEncode(y), d: keys.privateKey },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const header = base64UrlEncode(textEncoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60
  const claims = base64UrlEncode(textEncoder.encode(JSON.stringify({ aud: audience, exp, sub: subject })))
  const unsigned = `${header}.${claims}`
  const der = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, textEncoder.encode(unsigned)),
  )
  const signature = base64UrlEncode(ecdsaSignatureToRaw(der))
  return `vapid t=${unsigned}.${signature}, k=${keys.publicKey}`
}

export async function encryptPushPayload(
  subscription: PushSubscriptionKeys,
  plaintext: string,
  vapidKeys: VapidKeys,
  subject: string,
): Promise<{ body: Uint8Array; headers: Record<string, string> }> {
  const userPublicKey = base64UrlDecode(subscription.p256dh)
  const authSecret = base64UrlDecode(subscription.auth)
  if (userPublicKey.length !== 65) throw new Error('Invalid push subscription key (p256dh).')
  if (authSecret.length !== 16) throw new Error('Invalid push subscription secret (auth).')

  const ephemeral = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const ephemeralPublicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey))
  const peer = await crypto.subtle.importKey('raw', userPublicKey, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: peer }, ephemeral.privateKey, 256),
  )

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const keyInfo = concat(textEncoder.encode('WebPush: info'), new Uint8Array([0]), userPublicKey, ephemeralPublicRaw)
  const prk = await hkdf(authSecret, sharedSecret, keyInfo, 32)
  const contentEncryptionKey = await hkdf(salt, prk, textEncoder.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, prk, textEncoder.encode('Content-Encoding: nonce\0'), 12)

  const content = concat(textEncoder.encode(plaintext), new Uint8Array([0x02]))
  const aesKey = await crypto.subtle.importKey('raw', contentEncryptionKey, 'AES-GCM', false, ['encrypt'])
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, content),
  )

  const header = new Uint8Array(16 + 4 + 1 + 65)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, 4096)
  header[20] = 65
  header.set(ephemeralPublicRaw, 21)
  const body = concat(header, ciphertext)

  const audience = new URL(subscription.endpoint).origin
  const authorization = await vapidAuthorization(audience, subject, vapidKeys)
  return {
    body,
    headers: {
      TTL: '3600',
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      Authorization: authorization,
      'Crypto-Key': `p256ecdsa=${vapidKeys.publicKey}`,
    },
  }
}
