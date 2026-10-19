import { describe, expect, it } from 'vitest'
import { callReducer, initialCallState, type CallState } from './callMachine'
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
    const connecting = callReducer(outgoing, { type: 'remote-joined' })
    const connected = callReducer(connecting, { type: 'connected', at: 1000 })
    expect(connected.phase).toBe('connected')
    expect(connected.startedAt).toBe(1000)
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

  it('keeps the screen up when the microphone fails', () => {
    const failed = callReducer(start(), { type: 'fail', error: 'No microphone' })
    expect(failed.phase).toBe('outgoing')
    expect(failed.error).toBe('No microphone')
  })
})
