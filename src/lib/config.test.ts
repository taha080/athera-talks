import { describe, expect, it } from 'vitest'
import { isSupabaseConfigured } from './config'

describe('isSupabaseConfigured', () => {
  it('rejects empty and placeholder values', () => {
    expect(isSupabaseConfigured('', '')).toBe(false)
    expect(isSupabaseConfigured('https://your-project.supabase.co', 'your-anon-key')).toBe(false)
    expect(isSupabaseConfigured('not a url', 'abcdefghijklmnopqrstuvwxyz')).toBe(false)
  })

  it('accepts a real project url and a long anon key', () => {
    expect(
      isSupabaseConfigured(
        'https://abccompany.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example',
      ),
    ).toBe(true)
  })
})
