import { describe, expect, it } from 'vitest'
import { createDemoBackend, type MemoryStorage } from './backend'
import { buildSeed, DEMO_EMAIL, DEMO_PASSWORD, GROUP_CHAT, KENJI_CHAT, KENJI_ID, MIRA_CHAT, MIRA_ID, REN_CHAT, SAKURA_CHAT, SAKURA_ID, TAHA_ID } from './seed'

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
    const found = await demo.searchUsers('@Sakura')
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
    expect(list.find((chat) => chat.id === SAKURA_CHAT)?.lastMessage?.body).toBe('This message was deleted')
  })

  it('matches only a full username and hides either side of a block', async () => {
    const seed = buildSeed()
    const azan = 'a1000000-0000-4000-8000-000000000091'
    const azanx = 'a1000000-0000-4000-8000-000000000092'
    seed.profiles.push(
      { id: azan, username: 'azan_', avatarUrl: 'https://example.com/azan.gif', favouriteAnime: 'Naruto', isCreator: false },
      { id: azanx, username: 'azanx', avatarUrl: null, favouriteAnime: null },
    )
    seed.accounts.push({ email: 'sakura@example.com', password: 'secret1', profileId: SAKURA_ID })
    const demo = createDemoBackend({ initial: seed })
    await demo.signIn(DEMO_EMAIL, DEMO_PASSWORD)
    expect((await demo.searchUsers('AZAN_')).map((person) => person.username)).toEqual(['azan_'])
    expect((await demo.searchUsers('@azan_')).map((person) => person.username)).toEqual(['azan_'])
    expect(await demo.searchUsers('_')).toEqual([])
    expect(await demo.searchUsers('%')).toEqual([])
    expect(await demo.searchUsers('taha')).toEqual([])
    expect(await demo.searchUsers('aza')).toEqual([])
    expect(await demo.searchUsers('a')).toEqual([])
    expect(await demo.searchUsers('s')).toEqual([])
    expect((await demo.searchUsers('azan_'))[0]?.avatarUrl).toBe('https://example.com/azan.gif')
    await demo.blockUser(azan)
    expect(await demo.searchUsers('azan_')).toEqual([])
    demo.signOut()
    await demo.signIn('sakura@example.com', 'secret1')
    await demo.blockUser(TAHA_ID)
    demo.signOut()
    await demo.signIn(DEMO_EMAIL, DEMO_PASSWORD)
    expect(await demo.searchUsers('sakura')).toEqual([])
  })

  it('blocks a chat until the contact request is accepted', async () => {
    const demo = createDemoBackend()
    const hana = await demo.signUp({ email: 'hana@example.com', password: 'secret1', username: 'hana' })
    demo.signOut()
    await demo.signIn(DEMO_EMAIL, DEMO_PASSWORD)

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

  it('stores hidden reads and shows them only to the creator', async () => {
    const seed = buildSeed(Date.parse('2026-10-19T12:00:00Z'))
    const mira = seed.profiles.find((profile) => profile.id === MIRA_ID)
    if (!mira) throw new Error('Mira is missing from the demo seed.')
    mira.showLastSeen = false
    mira.showReadReceipts = false
    seed.accounts.push(
      { email: 'mira@example.com', password: 'secret1', profileId: MIRA_ID },
      { email: 'sakura@example.com', password: 'secret1', profileId: SAKURA_ID },
    )
    const demo = createDemoBackend({ initial: seed })

    await demo.signIn(DEMO_EMAIL, DEMO_PASSWORD)
    const asCreator = (await demo.listConversations()).find((chat) => chat.id === MIRA_CHAT)
    expect(asCreator?.peer.lastSeenAt).toBeTruthy()
    expect(asCreator?.peer.showReadReceipts).toBe(true)
    expect(asCreator?.lastMessage?.readAt).toBeTruthy()
    const sent = await demo.sendMessage(MIRA_CHAT, 'still there?')

    demo.signOut()
    await demo.signIn('mira@example.com', 'secret1')
    await demo.markRead(MIRA_CHAT)

    demo.signOut()
    await demo.signIn(DEMO_EMAIL, DEMO_PASSWORD)
    const creatorThread = await demo.listMessages(MIRA_CHAT)
    expect(creatorThread.find((message) => message.id === sent.id)?.readAt).toBeTruthy()

    demo.signOut()
    await demo.signIn('sakura@example.com', 'secret1')
    await demo.requestContact(MIRA_ID)
    demo.signOut()
    await demo.signIn('mira@example.com', 'secret1')
    const request = (await demo.listRequests())[0]
    const chatId = await demo.acceptRequest(request.id)
    demo.signOut()
    await demo.signIn('sakura@example.com', 'secret1')
    const fromSakura = await demo.sendMessage(chatId, 'hello mira')
    const hiddenPresence = (await demo.listConversations()).find((chat) => chat.id === chatId)
    expect(hiddenPresence?.peer.lastSeenAt ?? null).toBeNull()
    expect(hiddenPresence?.peer.showReadReceipts).toBe(false)

    demo.signOut()
    await demo.signIn('mira@example.com', 'secret1')
    await demo.markRead(chatId)
    demo.signOut()
    await demo.signIn('sakura@example.com', 'secret1')
    const hiddenThread = await demo.listMessages(chatId)
    expect(hiddenThread.find((message) => message.id === fromSakura.id)?.readAt ?? null).toBeNull()
    expect(hiddenThread.find((message) => message.id === fromSakura.id)?.deliveredAt ?? null).toBeNull()
    const hiddenList = (await demo.listConversations()).find((chat) => chat.id === chatId)
    expect(hiddenList?.lastMessage?.readAt ?? null).toBeNull()
  })

  it('blocks messaging both ways, stores a report, and shows reports only to the creator', async () => {
    const seed = buildSeed()
    seed.accounts.push({ email: 'sakura@example.com', password: 'secret1', profileId: SAKURA_ID })
    const demo = createDemoBackend({ initial: seed })
    await demo.signIn(DEMO_EMAIL, DEMO_PASSWORD)
    await demo.blockUser(SAKURA_ID)
    await expect(demo.sendMessage(SAKURA_CHAT, 'still there?')).rejects.toThrow(/blocked/)
    const blocked = await demo.listBlocked()
    expect(blocked.map((person) => person.username)).toEqual(['sakura'])
    expect((await demo.listConversations()).find((chat) => chat.id === SAKURA_CHAT)?.blockedByMe).toBe(true)

    demo.signOut()
    await demo.signIn('sakura@example.com', 'secret1')
    await expect(demo.sendMessage(SAKURA_CHAT, 'hello?')).rejects.toThrow(/blocked/)
    await demo.reportUser(TAHA_ID, 'Spam', 'sent the same link', SAKURA_CHAT)
    await expect(demo.listReports()).rejects.toThrow(/creator/)

    demo.signOut()
    await demo.signIn(DEMO_EMAIL, DEMO_PASSWORD)
    const reports = await demo.listReports()
    expect(reports[0]?.reporterUsername).toBe('sakura')
    expect(reports[0]?.reportedUsername).toBe('taha')
    expect(reports[0]?.reason).toBe('Spam')
    expect(reports[0]?.details).toBe('sent the same link')
    await demo.unblockUser(SAKURA_ID)
    const sent = await demo.sendMessage(SAKURA_CHAT, 'back')
    expect(sent.body).toBe('back')
  })

  it('edits your own text and keeps a deleted message as a placeholder', async () => {
    const demo = createDemoBackend()
    await demo.signIn(DEMO_EMAIL, DEMO_PASSWORD)
    const sent = await demo.sendMessage(SAKURA_CHAT, 'first draft')
    await demo.editMessage(sent.id, 'final cut')
    const edited = (await demo.listMessages(SAKURA_CHAT)).find((message) => message.id === sent.id)
    expect(edited?.body).toBe('final cut')
    expect(edited?.editedAt).toBeTruthy()
    const sakuraMessage = (await demo.listMessages(SAKURA_CHAT)).find((message) => message.senderId === SAKURA_ID)
    await expect(demo.editMessage(sakuraMessage?.id ?? '', 'nope')).rejects.toThrow(/cannot be edited/)
    await demo.deleteForEveryone(edited ?? sent)
    const gone = (await demo.listMessages(SAKURA_CHAT)).find((message) => message.id === sent.id)
    expect(gone?.deletedAt).toBeTruthy()
    expect(gone?.body).toBe('')
  })

  it('creates a group, names senders, and lets an admin remove a member', async () => {
    const seed = buildSeed()
    seed.accounts.push({ email: 'sakura@example.com', password: 'secret1', profileId: SAKURA_ID })
    const demo = createDemoBackend({ initial: seed })
    await demo.signIn(DEMO_EMAIL, DEMO_PASSWORD)
    const existing = (await demo.listConversations()).find((chat) => chat.id === GROUP_CHAT)
    expect(existing?.kind).toBe('group')
    expect(existing?.title).toBe('Night watch')
    const members = await demo.listMembers(GROUP_CHAT)
    expect(members.map((member) => member.username)).toEqual(['taha', 'sakura', 'kenji', 'mira'])
    const created = await demo.createGroup('Rewatch', [SAKURA_ID, KENJI_ID])
    await demo.sendMessage(created, 'starting now')
    await demo.removeMember(created, KENJI_ID)
    expect((await demo.listMembers(created)).map((member) => member.username)).toEqual(['taha', 'sakura'])
    await demo.setMemberRole(created, SAKURA_ID, 'admin')
    demo.signOut()
    await demo.signIn('sakura@example.com', 'secret1')
    await demo.leaveGroup(created)
    demo.signOut()
    await demo.signIn(DEMO_EMAIL, DEMO_PASSWORD)
    expect((await demo.listMembers(created)).map((member) => member.id)).toEqual([TAHA_ID])
    await demo.deleteGroup(created)
    expect((await demo.listConversations()).some((chat) => chat.id === created)).toBe(false)
  })

  it('hides a group member last seen unless they share it or the viewer is the creator', async () => {
    const seed = buildSeed()
    const kenji = seed.profiles.find((profile) => profile.id === KENJI_ID)
    if (kenji) kenji.showLastSeen = false
    seed.accounts.push({ email: 'sakura@example.com', password: 'secret1', profileId: SAKURA_ID })
    const demo = createDemoBackend({ initial: seed })
    await demo.signIn('sakura@example.com', 'secret1')
    const hidden = await demo.listMembers(GROUP_CHAT)
    expect(hidden.find((member) => member.id === KENJI_ID)?.lastSeenAt).toBeNull()
    expect(hidden.find((member) => member.id === SAKURA_ID)?.lastSeenAt).toBeTruthy()
    demo.signOut()
    await demo.signIn(DEMO_EMAIL, DEMO_PASSWORD)
    const asCreator = await demo.listMembers(GROUP_CHAT)
    expect(asCreator.find((member) => member.id === KENJI_ID)?.lastSeenAt).toBeTruthy()
  })

  it('pins three chats, mutes, and unarchives on a new message unless muted', async () => {
    const seed = buildSeed()
    seed.accounts.push({ email: 'sakura@example.com', password: 'secret1', profileId: SAKURA_ID })
    const demo = createDemoBackend({ initial: seed })
    await demo.signIn(DEMO_EMAIL, DEMO_PASSWORD)
    await demo.setChatPref(SAKURA_CHAT, { pinned: true })
    await demo.setChatPref(KENJI_CHAT, { pinned: true })
    await demo.setChatPref(MIRA_CHAT, { pinned: true })
    await expect(demo.setChatPref(REN_CHAT, { pinned: true })).rejects.toThrow(/3 chats/)
    const pinned = (await demo.listConversations()).filter((chat) => chat.pinned).map((chat) => chat.id)
    expect(pinned).toHaveLength(3)
    expect((await demo.listConversations())[0]?.pinned).toBe(true)

    await demo.setChatPref(SAKURA_CHAT, { archived: true })
    expect((await demo.listConversations()).find((chat) => chat.id === SAKURA_CHAT)?.archived).toBe(true)
    demo.signOut()
    await demo.signIn('sakura@example.com', 'secret1')
    await demo.sendMessage(SAKURA_CHAT, 'you there?')
    demo.signOut()
    await demo.signIn(DEMO_EMAIL, DEMO_PASSWORD)
    expect((await demo.listConversations()).find((chat) => chat.id === SAKURA_CHAT)?.archived).toBe(false)

    await demo.setChatPref(MIRA_CHAT, { archived: true, muted: true })
    await demo.sendMessage(MIRA_CHAT, 'still archived')
    const mira = (await demo.listConversations()).find((chat) => chat.id === MIRA_CHAT)
    expect(mira?.archived).toBe(true)
    expect(mira?.muted).toBe(true)
    await demo.setChatPref(GROUP_CHAT, { muted: true, pinned: false })
    expect((await demo.listConversations()).find((chat) => chat.id === GROUP_CHAT)?.muted).toBe(true)
  })
})
