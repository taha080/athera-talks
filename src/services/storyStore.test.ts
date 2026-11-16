import { describe, expect, it } from 'vitest'
import { createLocalStoryStore } from './storyStore'
import type { Profile } from '../types'

const me: Profile = {
  id: 'user-taha',
  username: 'taha',
  avatarUrl: null,
  favouriteAnime: 'Frieren',
}

describe('local story store', () => {
  it('seeds demo stories and lists them newest first', async () => {
    const store = createLocalStoryStore(me)
    const list = await store.listStories()
    expect(list.length).toBe(2)
    expect(list[0].author.username).toBe('sakura')
    expect(list[1].author.username).toBe('ren')
    expect(list.every((item) => item.kind === 'text')).toBe(true)
  })

  it('posts a text story, marks it viewed, then deletes it', async () => {
    const store = createLocalStoryStore(me)
    const created = await store.postText({ text: 'Hello stories', background: 'ocean' })
    expect(created.kind).toBe('text')
    expect(created.authorId).toBe(me.id)
    expect(created.viewedByMe).toBe(true)
    expect(new Date(created.expiresAt).getTime() - new Date(created.createdAt).getTime()).toBe(24 * 60 * 60 * 1000)

    await store.markViewed('story-demo-sakura')
    const list = await store.listStories()
    const seen = list.find((item) => item.id === 'story-demo-sakura')
    expect(seen?.viewedByMe).toBe(true)
    expect(seen?.viewCount).toBe(1)

    await store.deleteStory(created.id)
    const after = await store.listStories()
    expect(after.some((item) => item.id === created.id)).toBe(false)
  })

  it('rejects empty text and over-long text', async () => {
    const store = createLocalStoryStore(me)
    await expect(store.postText({ text: '  ', background: 'sunset' })).rejects.toThrow('Write something first.')
    await expect(store.postText({ text: 'x'.repeat(281), background: 'sunset' })).rejects.toThrow('280')
  })

  it('rejects non-image files and photos over 30 MB', async () => {
    const store = createLocalStoryStore(me)
    const video = new Blob(['x'], { type: 'video/mp4' })
    await expect(store.postPhoto({ file: video, caption: '' })).rejects.toThrow('Pick an image file.')
    const huge = new Blob([new Uint8Array(31 * 1024 * 1024)], { type: 'image/jpeg' })
    await expect(store.postPhoto({ file: huge, caption: '' })).rejects.toThrow('30 MB')
  })

  it('blocks deleting a story the user does not own', async () => {
    const store = createLocalStoryStore(me)
    await expect(store.deleteStory('story-demo-sakura')).rejects.toThrow('Only the author can delete a story.')
  })

  it('notifies subscribers when a story is posted', async () => {
    const store = createLocalStoryStore(me)
    let calls = 0
    const stop = store.subscribe(() => {
      calls += 1
    })
    await store.postText({ text: 'ping', background: 'ember' })
    expect(calls).toBe(1)
    stop()
    await store.postText({ text: 'pong', background: 'ember' })
    expect(calls).toBe(1)
  })
})
