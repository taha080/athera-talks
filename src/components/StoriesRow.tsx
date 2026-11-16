// Stories row at the top of the chat list: your own circle first (with
// a + affordance), then your contacts' stories, unseen first.
//
// The row prefers the Supabase store when the stories migration has been
// applied and falls back to the local demo store otherwise, exactly like
// Communities. The rest of the app is never broken by a missing table.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from '../context/SessionContext'
import { groupStoriesByAuthor, type Story, type StoryGroup } from '../lib/stories'
import { createLocalStoryStore, type StoryStore } from '../services/storyStore'
import { trySupabaseStoryStore } from '../services/storyBackend'
import { cn } from '../lib/cn'
import { Avatar } from './Avatar'
import { PlusIcon } from './Icons'
import { StoryComposer } from './StoryComposer'
import { StoryViewer } from './StoryViewer'
import type { Profile } from '../types'

export function StoriesRow({ me }: { me: Profile }) {
  const { mode } = useSession()
  const [store, setStore] = useState<StoryStore | null>(null)
  const [stories, setStories] = useState<Story[]>([])
  const [viewer, setViewer] = useState<{ authorId: string; storyId: string } | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [error, setError] = useState('')
  const storeRef = useRef<StoryStore | null>(null)

  const refresh = useCallback(async () => {
    const active = storeRef.current
    if (!active) return
    try {
      setStories(await active.listStories())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Stories could not be loaded.')
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function init() {
      const local = createLocalStoryStore(me)
      try {
        if (mode === 'live') {
          const live = await trySupabaseStoryStore(me)
          if (cancelled) return
          if (live) {
            storeRef.current = live
            setStore(live)
          } else {
            storeRef.current = local
            setStore(local)
          }
        } else {
          storeRef.current = local
          setStore(local)
        }
        await refresh()
      } catch (caught) {
        if (cancelled) return
        storeRef.current = local
        setStore(local)
        setError(caught instanceof Error ? caught.message : 'Stories could not be loaded.')
        try {
          await refresh()
        } catch {
          // Already falling back to the local store; nothing more to do.
        }
      }
    }
    void init()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, me.id])

  useEffect(() => {
    if (!store) return
    const stop = store.subscribe(() => void refresh())
    return stop
  }, [store, refresh])

  const groups: StoryGroup[] = groupStoriesByAuthor(stories, me.id)
  const ownGroup = groups.find((group) => group.author.id === me.id)
  const others = groups.filter((group) => group.author.id !== me.id)

  // Stable identity matters here: StoryViewer runs an effect on `onViewed`,
  // so a new callback every render would re-fire it, and the setStories call
  // below would loop forever (React error #185). The updater returns the
  // same array when the story is already viewed, so a repeat call is a
  // no-op instead of a re-render.
  const handleViewed = useCallback((storyId: string) => {
    const active = storeRef.current
    if (!active) return
    void (async () => {
      try {
        await active.markViewed(storyId)
      } catch {
        // A missed view is not worth an error banner; the ring just stays.
        return
      }
      setStories((current) => {
        const target = current.find((story) => story.id === storyId)
        if (!target || target.viewedByMe) return current
        return current.map((story) =>
          story.id === storyId ? { ...story, viewedByMe: true, viewCount: story.viewCount + 1 } : story,
        )
      })
    })()
  }, [])

  const handleDelete = useCallback(
    async (storyId: string) => {
      const active = storeRef.current
      if (!active) return
      setError('')
      try {
        await active.deleteStory(storyId)
        await refresh()
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not delete that story.')
      }
    },
    [refresh],
  )

  const closeViewer = useCallback(() => setViewer(null), [])

  return (
    <div className="shrink-0 border-b border-line/70 px-3 pb-2 pt-2">
      <div
        className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Stories"
      >
        <StoryCircle
          name="You"
          username={me.username}
          avatarUrl={me.avatarUrl}
          hasStories={Boolean(ownGroup)}
          unseen={false}
          own
          onOpen={() => {
            if (ownGroup) setViewer({ authorId: me.id, storyId: ownGroup.stories[0].id })
            else setComposerOpen(true)
          }}
        />
        {others.map((group) => (
          <StoryCircle
            key={group.author.id}
            name={group.author.username}
            username={group.author.username}
            avatarUrl={group.author.avatarUrl}
            hasStories
            unseen={group.unseen}
            onOpen={() => setViewer({ authorId: group.author.id, storyId: group.stories[0].id })}
          />
        ))}
      </div>
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
      {viewer ? (
        <StoryViewer
          groups={groups}
          meId={me.id}
          startAuthorId={viewer.authorId}
          startStoryId={viewer.storyId}
          onClose={closeViewer}
          onDelete={handleDelete}
          onViewed={handleViewed}
        />
      ) : null}
      {composerOpen && store ? (
        <StoryComposer
          onClose={() => setComposerOpen(false)}
          onPostPhoto={async (file, caption) => {
            await store.postPhoto({ file, caption })
            await refresh()
          }}
          onPostText={async (text, background) => {
            await store.postText({ text, background })
            await refresh()
          }}
        />
      ) : null}
    </div>
  )
}

function StoryCircle({
  name,
  username,
  avatarUrl,
  hasStories,
  unseen,
  own,
  onOpen,
}: {
  name: string
  username: string
  avatarUrl: string | null
  hasStories: boolean
  unseen: boolean
  own?: boolean
  onOpen: () => void
}) {
  return (
    <button type="button" className="story-circle flex w-14 shrink-0 flex-col items-center" onClick={onOpen} aria-label={hasStories ? `View ${name}'s stories` : 'Add a story'}>
      <span className="relative">
        <span
          className="story-ring block rounded-full p-[3px]"
          data-unseen={hasStories && unseen ? 'true' : undefined}
          style={
            hasStories
              ? unseen
                ? { background: 'conic-gradient(from 210deg, var(--accent), var(--accent-2), var(--foam), var(--accent))' }
                : { background: 'var(--line)' }
              : { background: 'transparent' }
          }
        >
          <span className="block rounded-full bg-panel p-[2px]">
            <Avatar name={username} url={avatarUrl} size="md" />
          </span>
        </span>
        {own ? (
          <span
            className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full border-2 border-panel bg-sakura text-white"
            aria-hidden="true"
          >
            <PlusIcon className="h-3 w-3" />
          </span>
        ) : null}
      </span>
      <span className={cn('mt-1 w-full truncate text-center text-[11px]', unseen ? 'font-semibold text-paper' : 'text-mist')}>
        {name}
      </span>
    </button>
  )
}
