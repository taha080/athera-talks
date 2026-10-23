import { describe, expect, it } from 'vitest'
import { PASSWORD_RESET_REDIRECT, isPasswordRecoveryUrl, routerBasename } from './url'

describe('routerBasename', () => {
  it('drops the trailing slash used by Vite base paths', () => {
    expect(routerBasename('/')).toBeUndefined()
    expect(routerBasename('/athera-talks/')).toBe('/athera-talks')
  })
})

describe('password reset redirect', () => {
  it('sends the email link to the GitHub Pages site', () => {
    expect(PASSWORD_RESET_REDIRECT).toBe('https://taha080.github.io/athera-talks/')
    expect(isPasswordRecoveryUrl('https://taha080.github.io/athera-talks/#access_token=abc&type=recovery')).toBe(true)
    expect(isPasswordRecoveryUrl('https://taha080.github.io/athera-talks/?code=abc&type=recovery')).toBe(true)
    expect(isPasswordRecoveryUrl('https://taha080.github.io/athera-talks/')).toBe(false)
  })
})
