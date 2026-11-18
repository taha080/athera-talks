import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appBadgeSupported, clearAppBadge, setAppBadge, syncAppBadge } from './appBadge'

describe('app badge', () => {
  let setAppBadgeMock: ReturnType<typeof vi.fn>
  let clearAppBadgeMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    setAppBadgeMock = vi.fn().mockResolvedValue(undefined)
    clearAppBadgeMock = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { setAppBadge: setAppBadgeMock, clearAppBadge: clearAppBadgeMock })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports support when the Badging API exists', () => {
    expect(appBadgeSupported()).toBe(true)
  })

  it('sets the badge to the unread count', () => {
    setAppBadge(2)
    expect(setAppBadgeMock).toHaveBeenCalledTimes(1)
    expect(setAppBadgeMock).toHaveBeenCalledWith(2)
  })

  it('floors fractional counts', () => {
    setAppBadge(2.7)
    expect(setAppBadgeMock).toHaveBeenCalledWith(2)
  })

  it('clears the badge for zero or negative counts', () => {
    setAppBadge(0)
    setAppBadge(-3)
    expect(setAppBadgeMock).not.toHaveBeenCalled()
    expect(clearAppBadgeMock).toHaveBeenCalledTimes(2)
  })

  it('syncs the badge to a positive total and clears it at zero', () => {
    syncAppBadge(5)
    expect(setAppBadgeMock).toHaveBeenCalledWith(5)
    syncAppBadge(0)
    expect(clearAppBadgeMock).toHaveBeenCalledTimes(1)
  })

  it('no-ops when the API is missing', () => {
    vi.stubGlobal('navigator', {})
    expect(appBadgeSupported()).toBe(false)
    expect(() => {
      setAppBadge(3)
      clearAppBadge()
      syncAppBadge(3)
    }).not.toThrow()
    expect(setAppBadgeMock).not.toHaveBeenCalled()
    expect(clearAppBadgeMock).not.toHaveBeenCalled()
  })

  it('never throws when the browser rejects the badge', async () => {
    setAppBadgeMock.mockRejectedValue(new Error('denied'))
    clearAppBadgeMock.mockRejectedValue(new Error('denied'))
    expect(() => {
      setAppBadge(2)
      clearAppBadge()
    }).not.toThrow()
    // Let the rejected promises settle; the helper swallows them.
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
})
