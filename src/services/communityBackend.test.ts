import { describe, expect, it } from 'vitest'
import { communityErrorMessage } from './communityBackend'

describe('communityErrorMessage', () => {
  it('keeps a real Error message', () => {
    expect(
      communityErrorMessage(new Error('infinite recursion detected in policy for relation "community_members"')),
    ).toContain('infinite recursion')
  })

  it('keeps a PostgREST-style plain object message', () => {
    expect(
      communityErrorMessage({
        message: 'infinite recursion detected in policy for relation "community_members"',
        code: '42P17',
      }),
    ).toContain('infinite recursion')
  })

  it('falls back to the generic message when there is none', () => {
    expect(communityErrorMessage({ code: '42501' })).toBe('Communities could not be loaded.')
    expect(communityErrorMessage(null)).toBe('Communities could not be loaded.')
  })
})
