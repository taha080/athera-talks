import { describe, expect, it } from 'vitest'
import {
  noticePreview,
  shouldPlayMessageSound,
  shouldShowDesktopNotification,
  shouldShowMessageNotice,
  stackNotices,
} from './notice'

const quiet = {
  mine: false,
  deleted: false,
  muted: false,
  blocked: false,
  conversationOpen: false,
  tabHidden: false,
}

describe('message notice', () => {
  it('shows when the chat is closed, and when the tab is hidden even if that chat is open', () => {
    expect(shouldShowMessageNotice(quiet)).toBe(true)
    expect(shouldShowMessageNotice({ ...quiet, conversationOpen: true, tabHidden: false })).toBe(false)
    expect(shouldShowMessageNotice({ ...quiet, conversationOpen: true, tabHidden: true })).toBe(true)
  })

  it('stays quiet for your own messages, muted chats, blocked people, and deletions', () => {
    expect(shouldShowMessageNotice({ ...quiet, mine: true })).toBe(false)
    expect(shouldShowMessageNotice({ ...quiet, muted: true })).toBe(false)
    expect(shouldShowMessageNotice({ ...quiet, blocked: true })).toBe(false)
    expect(shouldShowMessageNotice({ ...quiet, deleted: true })).toBe(false)
    expect(shouldShowMessageNotice({ ...quiet, muted: true, tabHidden: true })).toBe(false)
    expect(shouldShowMessageNotice({ ...quiet, blocked: true, tabHidden: true })).toBe(false)
  })

  it('labels voice notes and photos, and trims a long preview', () => {
    expect(noticePreview({ body: '', kind: 'voice' })).toBe('Voice note')
    expect(noticePreview({ body: '', kind: 'image' })).toBe('Photo')
    expect(noticePreview({ body: 'Tea is ready', kind: 'text' })).toBe('Tea is ready')
    expect(noticePreview({ body: 'x'.repeat(120), kind: 'text' }).endsWith('…')).toBe(true)
    expect(noticePreview({ body: 'x'.repeat(120), kind: 'text' }).length).toBe(90)
  })

  it('plays the tone only when a notice shows and sound is on', () => {
    expect(shouldPlayMessageSound({ show: true, notifySound: true })).toBe(true)
    expect(shouldPlayMessageSound({ show: true, notifySound: false })).toBe(false)
    expect(shouldPlayMessageSound({ show: false, notifySound: true })).toBe(false)
  })

  it('shows a browser notification only for a hidden tab with permission and the setting on', () => {
    const on = { show: true, tabHidden: true, notifyDesktop: true, permissionGranted: true }
    expect(shouldShowDesktopNotification(on)).toBe(true)
    expect(shouldShowDesktopNotification({ ...on, tabHidden: false })).toBe(false)
    expect(shouldShowDesktopNotification({ ...on, notifyDesktop: false })).toBe(false)
    expect(shouldShowDesktopNotification({ ...on, permissionGranted: false })).toBe(false)
    expect(shouldShowDesktopNotification({ ...on, show: false })).toBe(false)
  })

  it('keeps at most three notices', () => {
    expect(stackNotices(['a', 'b', 'c'], 'd')).toEqual(['b', 'c', 'd'])
    expect(stackNotices(['a'], 'b')).toEqual(['a', 'b'])
  })
})