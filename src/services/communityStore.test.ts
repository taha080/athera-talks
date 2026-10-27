import { describe, expect, it } from 'vitest'
import { createLocalCommunityStore } from './communityStore'
import type { Profile } from '../types'

const me: Profile = {
  id: 'user-taha',
  username: 'taha',
  avatarUrl: null,
  favouriteAnime: 'Frieren',
}

describe('deleteCommunity (local store)', () => {
  it('lets the owner delete a community they created', async () => {
    const store = createLocalCommunityStore(me)
    const created = await store.createCommunity({
      name: 'Temp Group',
      description: '',
      visibility: 'public',
      favouriteAnime: null,
    })
    await store.deleteCommunity(created.id)
    const list = await store.listCommunities()
    expect(list.some((item) => item.id === created.id)).toBe(false)
  })

  it('lets the owner delete the seeded demo community', async () => {
    const store = createLocalCommunityStore(me)
    await store.deleteCommunity('community-anime-nights')
    const list = await store.listCommunities()
    expect(list.some((item) => item.id === 'community-anime-nights')).toBe(false)
  })

  it('blocks deleting a community the user does not own', async () => {
    const store = createLocalCommunityStore(me)
    await expect(store.deleteCommunity('community-study-create')).rejects.toThrow(
      'Only the community owner can delete it.',
    )
  })
})
