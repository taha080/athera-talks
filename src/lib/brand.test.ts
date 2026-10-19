import { describe, expect, it } from 'vitest'
import { APP_NAME } from './brand'

describe('APP_NAME', () => {
  it('is the public product name', () => {
    expect(APP_NAME).toBe('Athera Talks')
  })
})
