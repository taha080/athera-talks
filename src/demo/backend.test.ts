import { describe, expect, it } from 'vitest'
import { createDemoBackend, type MemoryStorage } from './backend'
import { DEMO_EMAIL, DEMO_PASSWORD, SAKURA_CHAT, SAKURA_ID, TAHA_ID } from './seed'

function memory(): MemoryStorage {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
  }
}

describe('demo auth and chat', () => {
  it('signs in, keeps the session, and signs out', async () => {
    const storage = memory()
    const first = createDemoBackend({ persist: true, storage, now: Date.parse('2026-10-19T12:00:00Z') })
    expect(first.currentProfile()).toBeNull()
    const profile = await first.signIn(DEMO_EMAIL, DEMO_PASSWORD)
    expect(profile.username).toBe('taha')
    expect(profile.isCreator).toBe(true)

    const restored = createDemoBackend({ persist: true, storage })
    expect(restored.currentProfile()?.id).toBe(TAHA_ID)
    expect(restored.currentEmail()).toBe(DEMO_EMAIL)

    restored.signOut()
    expect(createDemoBackend({ persist: true, storage }).currentProfile()).toBeNull()
  })

  it('rejects a taken username and creates a new fan', async () => {
    const demo = createDemoBackend({ now: Date.parse('2026-10-19T12:00:00Z') })
    await expect(
      demo.signUp({ email: 'new@example.com', password: 'secret1', username: 'Taha' }),
    ).rejects.toThrow(/taken/)
    const created = await demo.signUp({
      email: 'new@example.com',
      password: 'secret1',
      username: 'Hana',
    })
    expect(created.username).toBe('hana')
    expect(demo.currentProfile()?.id).toBe(created.id)
  })

  it('resets a demo password and signs in with Google as Taha', async () => {
    const demo = createDemoBackend()
    expect(demo.requestPasswordReset('missing@example.com').found).toBe(false)
    expect(demo.requestPasswordReset(DEMO_EMAIL).found).toBe(true)
    demo.resetPassword(DEMO_EMAIL, 'newpass')
    await expect(demo.signIn(DEMO_EMAIL, DEMO_PASSWORD)).rejects.toThrow(/do not match/)
    await demo.signIn(DEMO_EMAIL, 'newpass')
    demo.signOut()
    const google = await demo.signInWithGoogle()
    expect(google.id).toBe(TAHA_ID)
  })

  it('searches, reuses a chat, sends a message, and clears unread', async () => {
    const demo = createDemoBackend()
    await demo.signIn(DEMO_EMAIL, DEMO_PASSWORD)
    expect(await demo.searchUsers('sak')).toEqual([])
    const found = await demo.searchUsers('Sakura')
    expect(found.map((profile) => profile.username)).toEqual(['sakura'])
    expect(found[0]?.isCreator).toBeFalsy()
    const existing = await demo.startConversation(SAKURA_ID)
    expect(existing).toBe(SAKURA_CHAT)
    const before = await demo.listConversations()
    expect(before.find((chat) => chat.id === SAKURA_CHAT)?.unread).toBeGreaterThan(0)
    await demo.markRead(SAKURA_CHAT)
    const after = await demo.listConversations()
    expect(after.find((chat) => chat.id === SAKURA_CHAT)?.unread).toBe(0)

    let inserted = 0
    demo.subscribe({
      onInsert: () => {
        inserted += 1
      },
      onUpdate: () => {},
    })
    const sent = await demo.sendMessage(SAKURA_CHAT, 'one more episode')
    expect(inserted).toBe(1)
    const thread = await demo.listMessages(SAKURA_CHAT)
    expect(thread.at(-1)?.id).toBe(sent.id)

    const reply = await demo.sendMessage(SAKURA_CHAT, 'replying', { id: sent.id, preview: 'one more episode' })
    expect(reply.replyPreview).toBe('one more episode')
    await demo.hideMessage(reply.id)
    const hidden = await demo.listMessages(SAKURA_CHAT)
    expect(hidden.some((message) => message.id === reply.id)).toBe(false)
    await demo.deleteForEveryone(sent)
    const deleted = (await demo.listMessages(SAKURA_CHAT)).find((message) => message.id === sent.id)
    expect(deleted?.deletedAt).toBeTruthy()
    const list = await demo.listConversations()
    expect(list.find((chat) => chat.id === SAKURA_CHAT)?.lastMessage?.body).toBe('Message deleted')
  })

  it('blocks a chat until the contact request is accepted', async () => {
    const demo = createDemoBackend()
    const hana = await demo.signUp({ email: 'hana@example.com', password: 'secret1', username: 'hana' })
    demo.signOut()
    await demo.signIn(DEMO_EMAIL, DEMO_PASSWORD)

    expect(await demo.searchUsers('han')).toEqual([])
    const found = await demo.searchUsers('hana')
    expect(found[0]?.requestStatus ?? null).toBeNull()
    await expect(demo.startConversation(hana.id)).rejects.toThrow(/accept/)

    await demo.requestContact(hana.id)
    const outgoing = await demo.listRequests()
    expect(outgoing.map((request) => request.peer.username)).toEqual(['hana'])
    await expect(demo.startConversation(hana.id)).rejects.toThrow(/accept/)
    await demo.cancelRequest(outgoing[0].id)
    expect(await demo.listRequests()).toEqual([])

    await demo.requestContact(hana.id)
    demo.signOut()
    await demo.signIn('hana@example.com', 'secret1')
    const incoming = await demo.listRequests()
    expect(incoming).toHaveLength(1)
    expect(incoming[0]?.fromId).not.toBe(hana.id)

    await demo.declineRequest(incoming[0].id)
    expect(await demo.listRequests()).toEqual([])
    demo.signOut()
    await demo.signIn(DEMO_EMAIL, DEMO_PASSWORD)
    await demo.requestContact(hana.id)
    demo.signOut()
    await demo.signIn('hana@example.com', 'secret1')
    const again = await demo.listRequests()
    const chatId = await demo.acceptRequest(again[0].id)
    const sent = await demo.sendMessage(chatId, 'hello')
    expect(sent.body).toBe('hello')
    expect((await demo.listConversations()).some((chat) => chat.id === chatId)).toBe(true)

    demo.signOut()
    await demo.signIn(DEMO_EMAIL, DEMO_PASSWORD)
    expect((await demo.listConversations()).some((chat) => chat.id === chatId)).toBe(true)
    const reply = await demo.sendMessage(chatId, 'hi back')
    expect(reply.body).toBe('hi back')
  })
})
