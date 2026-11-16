// Full-screen story viewer: progress bars, auto-advance, tap to move
// between stories and authors, delete for your own stories.
//
// Photo stories show for 5 seconds, text stories for 7 (see
// lib/stories.ts). The viewer never fetches on its own: the row hands it
// the current groups, and it reports each story it shows via onViewed so
// the row can mark it seen.

import { useCallback, useEffect, useRef, useState } from 'react'
import { formatStoryTime, gradientCss, storyDurationMs, type StoryGroup } from '../lib/stories'
import { cn } from '../lib/cn'
import { Avatar } from './Avatar'
import { CloseIcon, EyeIcon, TrashIcon } from './Icons'

export function StoryViewer({
  groups,
  meId,
  startAuthorId,
  startStoryId,
  onClose,
  onDelete,
  onViewed,
}: {
  groups: StoryGroup[]
  meId: string
  startAuthorId: string
  startStoryId: string
  onClose: () => void
  onDelete: (storyId: string) => Promise<void>
  onViewed: (storyId: string) => void
}) {
  const flat = groups.flatMap((group, groupIndex) =>
    group.stories.map((story, storyIndex) => ({ group, story, groupIndex, storyIndex })),
  )
  const flatRef = useRef(flat)
  flatRef.current = flat
  const startIndex = flat.findIndex((item) => item.story.id === startStoryId)
  const authorStart = flat.findIndex((item) => item.group.author.id === startAuthorId)
  const [index, setIndex] = useState(startIndex >= 0 ? startIndex : authorStart >= 0 ? authorStart : 0)
  const [elapsed, setElapsed] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const current = flat[index] ?? null
  const duration = current ? storyDurationMs(current.story) : 5000

  const goNext = useCallback(() => {
    const total = flatRef.current.length
    setIndex((currentIndex) => {
      if (currentIndex + 1 < total) return currentIndex + 1
      return currentIndex
    })
    if (index + 1 >= flatRef.current.length) onClose()
  }, [index, onClose])

  const goPrev = useCallback(() => {
    setIndex((currentIndex) => {
      if (currentIndex > 0) return currentIndex - 1
      return currentIndex
    })
    setElapsed(0)
    setConfirmDelete(false)
  }, [])

  // The list can shrink while open (a story deleted, or one expiring):
  // stay on a valid story, or close when nothing is left.
  useEffect(() => {
    if (flat.length === 0) {
      onClose()
      return
    }
    if (index >= flat.length) setIndex(flat.length - 1)
  }, [flat.length, index, onClose])

  // Depend on the story id, not the `current` object: `flat` is rebuilt
  // on every render, so an object dep would restart the timer on each
  // progress tick and the story would never advance.
  const currentStoryId = current?.story.id
  useEffect(() => {
    if (!currentStoryId) return
    onViewed(currentStoryId)
  }, [currentStoryId, onViewed])

  useEffect(() => {
    if (!currentStoryId) return
    setElapsed(0)
    const started = Date.now()
    const timer = window.setInterval(() => {
      const done = Date.now() - started
      if (done >= duration) {
        window.clearInterval(timer)
        goNext()
      } else {
        setElapsed(done)
      }
    }, 100)
    return () => window.clearInterval(timer)
  }, [currentStoryId, duration, goNext])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowRight') goNext()
      if (event.key === 'ArrowLeft') goPrev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, goNext, goPrev])

  if (!current) return null
  const { group, story } = current
  const mine = story.authorId === meId
  const progress = Math.min(100, (elapsed / duration) * 100)

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setDeleting(true)
    try {
      await onDelete(story.id)
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95"
      role="dialog"
      aria-label={`Story by ${group.author.username}`}
    >
      <div className="relative flex h-full w-full max-w-md flex-col overflow-hidden bg-black sm:h-[92dvh] sm:rounded-2xl">
        {/* Progress segments for this author's stories. */}
        <div className="absolute inset-x-3 top-3 z-30 flex gap-1">
          {group.stories.map((item, itemIndex) => (
            <span key={item.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/30">
              <span
                className="block h-full rounded-full bg-white transition-[width] duration-100 ease-linear"
                style={{ width: itemIndex < current.storyIndex ? '100%' : itemIndex === current.storyIndex ? `${progress}%` : '0%' }}
              />
            </span>
          ))}
        </div>

        <header className="absolute inset-x-0 top-0 z-30 flex items-center gap-3 bg-gradient-to-b from-black/70 to-transparent px-3 pb-6 pt-7">
          <Avatar name={group.author.username} url={group.author.avatarUrl} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-white">
              {mine ? 'Your story' : `@${group.author.username}`}
            </span>
            <span className="block text-xs text-white/70">{formatStoryTime(story.createdAt)}</span>
          </span>
          {mine ? (
            <span className="flex items-center gap-1 text-xs text-white/80" title="Views">
              <EyeIcon className="h-4 w-4" />
              {story.viewCount}
            </span>
          ) : null}
          {mine ? (
            <button
              type="button"
              className={cn(
                'grid h-9 min-w-9 place-items-center rounded-full px-2 text-xs font-medium text-white transition hover:bg-white/20',
                confirmDelete ? 'bg-danger/80' : '',
              )}
              onClick={() => void handleDelete()}
              disabled={deleting}
              aria-label={confirmDelete ? 'Confirm delete story' : 'Delete story'}
            >
              {confirmDelete ? (deleting ? 'Deleting…' : 'Delete?') : <TrashIcon className="h-4 w-4" />}
            </button>
          ) : null}
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-full text-white transition hover:bg-white/20"
            onClick={onClose}
            aria-label="Close stories"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </header>

        {/* Story content. */}
        {story.kind === 'photo' && story.mediaUrl ? (
          <img src={story.mediaUrl} alt={story.caption ?? 'Story photo'} className="h-full w-full object-contain" />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center px-8 py-20"
            style={{ background: gradientCss(story.background) }}
          >
            <p className="whitespace-pre-wrap break-words text-center text-2xl font-semibold leading-snug text-white">
              {story.text}
            </p>
          </div>
        )}
        {story.kind === 'photo' && story.caption ? (
          <p className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/70 to-transparent px-4 pb-5 pt-10 text-center text-sm text-white">
            {story.caption}
          </p>
        ) : null}

        {/* Tap zones: left quarter goes back, the rest goes forward. */}
        <button type="button" className="absolute inset-y-0 left-0 z-10 w-1/4" onClick={goPrev} aria-label="Previous story" />
        <button type="button" className="absolute inset-y-0 right-0 z-10 w-3/4" onClick={goNext} aria-label="Next story" />
      </div>
    </div>
  )
}
