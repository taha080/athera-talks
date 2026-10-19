import { describe, expect, it } from 'vitest'
import { routerBasename } from './url'

describe('routerBasename', () => {
  it('drops the trailing slash used by Vite base paths', () => {
    expect(routerBasename('/')).toBeUndefined()
    expect(routerBasename('/ta-talk/')).toBe('/ta-talk')
  })
})
