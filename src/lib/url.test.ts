import { describe, expect, it } from 'vitest'
import { PASSWORD_RESET_REDIRECT, isPasswordRecoveryUrl, routerBasename } from './url'

describe('routerBasename', () => {
  it('drops the trailing slash used by Vite base paths', () => {
    expect(routerBasename('/')).toBeUndefined()
    expect(routerBasename('/ta-talk/')).toBe('/ta-talk')
  })
})

describe('password reset redirect', () => {
  it('sends the email link to the GitHub Pages site', () => {
    expect(PASSWORD_RESET_REDIRECT).toBe('https://taha080.github.io/ta-talk/')
    expect(isPasswordRecoveryUrl('https://taha080.github.io/ta-talk/#access_token=abc&type=recovery')).toBe(true)
    expect(isPasswordRecoveryUrl('https://taha080.github.io/ta-talk/?code=abc&type=recovery')).toBe(true)
    expect(isPasswordRecoveryUrl('https://taha080.github.io/ta-talk/')).toBe(false)
  })
})
