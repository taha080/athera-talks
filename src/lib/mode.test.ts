import { describe, expect, it } from 'vitest'
import { startMode } from './mode'

describe('startMode', () => {
  it('opens real sign-in when Supabase keys are present, even if a demo flag is stored', () => {
    expect(startMode(true, true)).toBe('live')
    expect(startMode(true, false)).toBe('live')
  })

  it('keeps the sample circle only when keys are missing', () => {
    expect(startMode(false, true)).toBe('demo')
    expect(startMode(false, false)).toBe('setup')
  })
})
