import { describe, expect, it } from 'vitest'
import {
  buildIceServers,
  candidateType,
  filterBrowserIceServers,
  formatCallLink,
  formatCandidateTypes,
  googleStunServers,
  hasLiveAudioSender,
  iceServersOrFallback,
  mediaError,
  meteredFallbackServers,
  METERED_FALLBACK_CREDENTIAL,
  METERED_FALLBACK_USERNAME,
  turnRestCredential,
  usableTurnUrl,
} from './webrtc'

describe('buildIceServers', () => {
  it('stays on Google STUN until a relay is configured', async () => {
    expect(await buildIceServers()).toEqual(googleStunServers())
    expect(await buildIceServers({ urls: 'none' })).toEqual(googleStunServers())
    expect(await buildIceServers({ urls: 'turn:example.com:443?transport=tcp' })).toEqual(googleStunServers())
  })

  it('uses explicit TURN credentials, including TCP 443 and turns', async () => {
    const custom = await buildIceServers({
      urls: 'turns:turn.example.com:443?transport=tcp,turn:turn.example.com:443?transport=tcp,turn:turn.example.com:53?transport=udp',
      username: 'user',
      credential: 'pass',
    })
    expect(custom[2]).toMatchObject({
      urls: ['turns:turn.example.com:443?transport=tcp', 'turn:turn.example.com:443?transport=tcp'],
      username: 'user',
      credential: 'pass',
    })
  })

  it('drops the browser-blocked port 53 URL and keeps turns on 443', () => {
    expect(usableTurnUrl('turns:turn.example.com:443?transport=tcp')).toBe(true)
    expect(usableTurnUrl('turns:turn.example.com:5349?transport=tcp')).toBe(true)
    expect(usableTurnUrl('turn:turn.example.com:53?transport=udp')).toBe(false)
    const filtered = filterBrowserIceServers([
      { urls: ['stun:stun.example.com:3478'] },
      {
        urls: [
          'turn:turn.example.com:3478?transport=udp',
          'turn:turn.example.com:443?transport=udp',
          'turn:turn.example.com:3478?transport=tcp',
          'turn:turn.example.com:80?transport=tcp',
          'turns:turn.example.com:5349?transport=tcp',
          'turns:turn.example.com:443?transport=tcp',
          'turn:turn.example.com:53?transport=udp',
        ],
        username: 'short',
        credential: 'lived',
      },
    ])
    const urls = filtered[1]?.urls
    expect(urls).toContain('turns:turn.example.com:443?transport=tcp')
    expect(urls).toContain('turn:turn.example.com:3478?transport=tcp')
    expect(urls).not.toContain('turn:turn.example.com:53?transport=udp')
  })

  it('falls back to the static Metered relay when the credential fetch fails', () => {
    const servers = meteredFallbackServers()
    expect(servers.map((server) => server.urls)).toEqual([
      'stun:stun.relay.metered.ca:80',
      'turn:global.relay.metered.ca:80',
      'turn:global.relay.metered.ca:80?transport=tcp',
      'turn:global.relay.metered.ca:443',
      'turns:global.relay.metered.ca:443?transport=tcp',
    ])
    expect(servers[0]?.username).toBeUndefined()
    expect(servers[1]).toMatchObject({
      username: METERED_FALLBACK_USERNAME,
      credential: METERED_FALLBACK_CREDENTIAL,
    })
    expect(servers[4]).toMatchObject({
      username: METERED_FALLBACK_USERNAME,
      credential: METERED_FALLBACK_CREDENTIAL,
    })
    const fetched = [{ urls: 'turn:fresh.example.com:443', username: 'short', credential: 'lived' }]
    expect(iceServersOrFallback(fetched)).toBe(fetched)
    expect(iceServersOrFallback(null)).toEqual(servers)
    expect(iceServersOrFallback([])).toEqual(servers)
  })
})

describe('turnRestCredential', () => {
  it('builds a time-limited username from the shared secret', async () => {
    const creds = await turnRestCredential('openrelayprojectsecret', 1_700_000_000_000)
    expect(creds.username.startsWith(String(1_700_000_000 + 12 * 60 * 60))).toBe(true)
    expect(creds.credential.length).toBeGreaterThan(10)
  })
})

describe('call audio helpers', () => {
  it('treats only a live enabled microphone as ready to offer', () => {
    expect(
      hasLiveAudioSender([{ track: { kind: 'audio', readyState: 'live', enabled: true } }]),
    ).toBe(true)
    expect(
      hasLiveAudioSender([{ track: { kind: 'audio', readyState: 'live', enabled: false } }]),
    ).toBe(false)
    expect(hasLiveAudioSender([{ track: null }])).toBe(false)
  })

  it('formats the on-screen ICE line', () => {
    expect(formatCallLink('connected', 'relay', 12, 34, 'playing', 'host, srflx, relay')).toBe(
      'ICE connected · path relay · candidates host, srflx, relay · in 12 · out 34 · playing',
    )
    expect(candidateType('candidate:1 1 UDP 1 1.2.3.4 9 typ srflx raddr 0.0.0.0 rport 9')).toBe('srflx')
    expect(formatCandidateTypes(['relay', 'host', 'srflx'])).toBe('host, srflx, relay')
  })
})

describe('mediaError', () => {
  it('explains a blocked or missing microphone', () => {
    expect(mediaError(new DOMException('no', 'NotAllowedError'))).toMatch(/permission/i)
    expect(mediaError(new DOMException('no', 'NotFoundError'))).toMatch(/No microphone/)
    expect(mediaError(new DOMException('busy', 'NotReadableError'))).toMatch(/in use/)
  })
})
