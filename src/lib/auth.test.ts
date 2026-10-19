import { describe, expect, it } from 'vitest'
import { googleAuthMode, googleSignInError, passwordIssue, signUpNeedsPasswordSignIn, usernameIssue } from './auth'

describe('usernameIssue', () => {
  it('accepts a normal username and rejects spaces or short names', () => {
    expect(usernameIssue('  Sakura_99 ')).toBeNull()
    expect(usernameIssue('ab')).toMatch(/3–20/)
    expect(usernameIssue('no spaces')).toMatch(/underscores/)
  })
})

describe('signUpNeedsPasswordSignIn', () => {
  it('enters on the sign-up session and only signs in when that session is missing', () => {
    expect(signUpNeedsPasswordSignIn({ access_token: 'session' })).toBe(false)
    expect(signUpNeedsPasswordSignIn(null)).toBe(true)
    expect(signUpNeedsPasswordSignIn(undefined)).toBe(true)
    expect(signUpNeedsPasswordSignIn({})).toBe(true)
  })
})

describe('passwordIssue', () => {
  it('requires 6 characters', () => {
    expect(passwordIssue('short')).toMatch(/6/)
    expect(passwordIssue('longenough')).toBeNull()
  })
})

describe('googleAuthMode', () => {
  it('is ready in demo mode and only when the flag is set for live mode', () => {
    expect(googleAuthMode(undefined, true)).toBe('ready')
    expect(googleAuthMode('false', false)).toBe('disabled')
    expect(googleAuthMode('true', false)).toBe('ready')
    expect(googleAuthMode(' YES ', false)).toBe('ready')
  })
})

describe('googleSignInError', () => {
  it('rewrites a disabled-provider error', () => {
    expect(googleSignInError('Provider is not enabled')).toMatch(/not enabled/)
    expect(googleSignInError('Network down')).toBe('Network down')
  })
})
