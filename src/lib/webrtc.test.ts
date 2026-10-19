import { describe, expect, it } from 'vitest'
import { buildIceServers, googleStunServers, mediaError, turnRestCredential } from './webrtc'

describe('buildIceServers', () => {
  it('always includes Google STUN and adds a TURN relay by default', async () => {
    const servers = await buildIceServers()
    expect(servers.slice(0, 2)).toEqual(googleStunServers())
    const turn = servers[2]
    expect(turn?.username).toMatch(/^\d+:athera$/)
    expect(turn?.credential).toBeTruthy()
    expect(turn?.urls).toEqual(expect.arrayContaining([expect.stringMatching(/^turns?:/)]))
  })

  it('uses explicit TURN credentials and can be turned off', async () => {
    const custom = await buildIceServers({
      urls: 'turn:example.com:443?transport=tcp',
      username: 'user',
      credential: 'pass',
    })
    expect(custom[2]).toMatchObject({
      urls: ['turn:example.com:443?transport=tcp'],
      username: 'user',
      credential: 'pass',
    })
    const stunOnly = await buildIceServers({ urls: 'none' })
    expect(stunOnly).toEqual(googleStunServers())
  })
})

describe('turnRestCredential', () => {
  it('builds a time-limited username from the shared secret', async () => {
    const creds = await turnRestCredential('openrelayprojectsecret', 1_700_000_000_000)
    expect(creds.username.startsWith(String(1_700_000_000 + 12 * 60 * 60))).toBe(true)
    expect(creds.credential.length).toBeGreaterThan(10)
  })
})

describe('mediaError', () => {
  it('explains a blocked or missing microphone', () => {
    expect(mediaError(new DOMException('no', 'NotAllowedError'))).toMatch(/permission/i)
    expect(mediaError(new DOMException('no', 'NotFoundError'))).toMatch(/No microphone/)
    expect(mediaError(new DOMException('busy', 'NotReadableError'))).toMatch(/in use/)
  })
})
