import { describe, expect, it } from 'vitest'
import { callHeadline, callReducer, CONNECT_TIMEOUT_MESSAGE, initialCallState, RELAY_RETRY_STATUS, type CallState } from './callMachine'
import type { Profile } from '../types'

const peer: Profile = {
  id: 'peer',
  username: 'sakura',
  avatarUrl: null,
  favouriteAnime: 'Demon Slayer',
}

function start(): CallState {
  return callReducer(initialCallState, { type: 'start', conversationId: 'c1', peer })
}

describe('callReducer', () => {
  it('walks an outgoing call through to a timer, mute, and hangup', () => {
    const outgoing = start()
    expect(outgoing.phase).toBe('outgoing')
    const ringing = callReducer(outgoing, { type: 'ringing' })
    expect(ringing.phase).toBe('ringing')
    const connecting = callReducer(ringing, { type: 'remote-joined' })
    const connected = callReducer(connecting, { type: 'connected', at: 1000 })
    expect(connected.phase).toBe('connected')
    expect(connected.connectedAt).toBe(1000)
    expect(callReducer(connected, { type: 'connected', at: 5000 }).connectedAt).toBe(1000)
    const muted = callReducer(connected, { type: 'toggle-mute' })
    expect(muted.muted).toBe(true)
    expect(callReducer(muted, { type: 'hangup' })).toEqual(initialCallState)
  })

  it('accepts an incoming call and ignores a second incoming while busy', () => {
    const incoming = callReducer(initialCallState, {
      type: 'incoming',
      conversationId: 'c1',
      peer,
    })
    expect(callReducer(incoming, { type: 'accept' }).phase).toBe('connecting')
    expect(callReducer(incoming, { type: 'start', conversationId: 'c2', peer })).toBe(incoming)
    expect(callReducer(start(), { type: 'accept' }).phase).toBe('outgoing')
  })

  it('keeps the screen up with a failed reason when the microphone fails', () => {
    const failed = callReducer(start(), { type: 'fail', error: 'No microphone' })
    expect(failed.phase).toBe('failed')
    expect(failed.error).toBe('No microphone')
    expect(callReducer(failed, { type: 'fail', error: 'later' }).error).toBe('No microphone')
    expect(callReducer(failed, { type: 'hangup' })).toEqual(initialCallState)
  })

  it('names each stage and derives the clock from the connect time', () => {
    const outgoing = start()
    expect(callHeadline(outgoing.phase, outgoing.connectedAt, 5_000)).toBe('Calling…')
    const ringing = callReducer(outgoing, { type: 'ringing' })
    expect(callHeadline(ringing.phase, ringing.connectedAt, 5_000)).toBe('Calling…')
    const incoming = callReducer(initialCallState, { type: 'incoming', conversationId: 'c1', peer })
    expect(callHeadline(incoming.phase, incoming.connectedAt, 5_000)).toBe('Ringing…')
    const connecting = callReducer(incoming, { type: 'accept' })
    expect(connecting.connectedAt).toBeNull()
    expect(callHeadline(connecting.phase, connecting.connectedAt, 5_000)).toBe('Connecting…')
    expect(callHeadline(connecting.phase, connecting.connectedAt, 5_000, true)).toBe(RELAY_RETRY_STATUS)
    expect(CONNECT_TIMEOUT_MESSAGE).toMatch(/25 seconds/)
    const connected = callReducer(connecting, { type: 'connected', at: 1_000 })
    expect(callHeadline(connected.phase, connected.connectedAt, 1_000)).toBe('00:00')
    expect(callHeadline(connected.phase, connected.connectedAt, 66_000)).toBe('01:05')
    expect(callHeadline(connected.phase, connected.connectedAt, 3_601_000)).toBe('1:00:00')
  })
})
