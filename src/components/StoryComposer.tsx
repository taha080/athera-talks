// New-story composer: a photo with an optional caption, or a short text
// on a gradient background, WhatsApp text-status style.
//
// The caller owns the actual post (local or Supabase store); this panel
// only validates input and reports the result.

import { useEffect, useRef, useState } from 'react'
import {
  STORY_CAPTION_MAX,
  STORY_TEXT_MAX,
  TEXT_GRADIENTS,
  gradientCss,
  storyCaptionIssue,
  storyPhotoIssue,
  storyTextIssue,
} from '../lib/stories'
import { cn } from '../lib/cn'
import { fieldClass, ghostButton, primaryButton } from '../lib/styles'
import { CloseIcon, ImageIcon, TextIcon } from './Icons'

export function StoryComposer({
  onClose,
  onPostPhoto,
  onPostText,
}: {
  onClose: () => void
  onPostPhoto: (file: File, caption: string) => Promise<void>
  onPostText: (text: string, background: string) => Promise<void>
}) {
  const [tab, setTab] = useState<'photo' | 'text'>('photo')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [caption, setCaption] = useState('')
  const [text, setText] = useState('')
  const [background, setBackground] = useState(TEXT_GRADIENTS[0].id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const previewRef = useRef<string | null>(null)

  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    },
    [],
  )

  function pickPhoto(picked: File | null) {
    setError('')
    if (!picked) return
    const issue = storyPhotoIssue({ size: picked.size, type: picked.type })
    if (issue) {
      setError(issue)
      return
    }
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    const url = URL.createObjectURL(picked)
    previewRef.current = url
    setPreview(url)
    setFile(picked)
  }

  async function submitPhoto() {
    if (!file) return
    const captionIssue = storyCaptionIssue(caption)
    if (captionIssue) {
      setError(captionIssue)
      return
    }
    setBusy(true)
    setError('')
    try {
      await onPostPhoto(file, caption)
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not post that story.')
      setBusy(false)
    }
  }

  async function submitText() {
    const issue = storyTextIssue(text)
    if (issue) {
      setError(issue)
      return
    }
    setBusy(true)
    setError('')
    try {
      await onPostText(text, background)
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not post that story.')
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      role="dialog"
      aria-label="New story"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-4 shadow-md">
        <header className="flex items-center justify-between">
          <h2 className="text-base font-semibold">New story</h2>
          <button type="button" className="grid h-10 w-10 place-items-center rounded-lg text-mist hover:text-paper" onClick={onClose} aria-label="Close composer">
            <CloseIcon className="h-5 w-5" />
          </button>
        </header>

        <div className="mt-3 flex gap-1 rounded-lg bg-elevated p-1" role="tablist" aria-label="Story type">
          {(['photo', 'text'] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={tab === item}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition',
                tab === item ? 'bg-panel text-paper shadow-sm' : 'text-mist hover:text-paper',
              )}
              onClick={() => {
                setTab(item)
                setError('')
              }}
            >
              {item === 'photo' ? <ImageIcon className="h-4 w-4" /> : <TextIcon className="h-4 w-4" />}
              {item === 'photo' ? 'Photo' : 'Text'}
            </button>
          ))}
        </div>

        {tab === 'photo' ? (
          <div className="mt-3 space-y-3">
            {preview ? (
              <img src={preview} alt="Story photo preview" className="max-h-64 w-full rounded-xl object-contain bg-elevated" />
            ) : (
              <label className="flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-elevated text-sm text-mist transition hover:text-paper">
                <ImageIcon className="h-6 w-6" />
                Pick a photo
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="sr-only"
                  onChange={(event) => pickPhoto(event.target.files?.[0] ?? null)}
                />
              </label>
            )}
            {preview ? (
              <button
                type="button"
                className={cn(ghostButton, 'h-10 px-3 text-xs')}
                onClick={() => {
                  if (previewRef.current) URL.revokeObjectURL(previewRef.current)
                  previewRef.current = null
                  setPreview(null)
                  setFile(null)
                }}
              >
                Pick a different photo
              </button>
            ) : null}
            <input
              className={fieldClass}
              value={caption}
              maxLength={STORY_CAPTION_MAX}
              onChange={(event) => setCaption(event.target.value)}
              placeholder="Add a caption (optional)"
              aria-label="Caption"
            />
            <p className="text-xs text-mist">Disappears after 24 hours. Only your contacts can see it.</p>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <div
              className="flex min-h-56 items-center justify-center rounded-xl px-6 py-8"
              style={{ background: gradientCss(background) }}
            >
              <p className="whitespace-pre-wrap break-words text-center text-xl font-semibold leading-snug text-white">
                {text.trim() || 'Write something…'}
              </p>
            </div>
            <textarea
              className={fieldClass}
              value={text}
              maxLength={STORY_TEXT_MAX}
              rows={3}
              onChange={(event) => setText(event.target.value)}
              placeholder="Write your status…"
              aria-label="Story text"
            />
            <div className="flex items-center justify-between">
              <div className="flex gap-2" role="radiogroup" aria-label="Background">
                {TEXT_GRADIENTS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={background === item.id}
                    aria-label={item.label}
                    title={item.label}
                    className={cn(
                      'h-10 w-10 rounded-full transition',
                      background === item.id ? 'ring-2 ring-sakura ring-offset-2 ring-offset-panel' : 'opacity-80 hover:opacity-100',
                    )}
                    style={{ background: item.css }}
                    onClick={() => setBackground(item.id)}
                  />
                ))}
              </div>
              <span className="text-xs text-mist">
                {text.length}/{STORY_TEXT_MAX}
              </span>
            </div>
            <p className="text-xs text-mist">Disappears after 24 hours. Only your contacts can see it.</p>
          </div>
        )}

        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={cn(ghostButton, 'px-4')} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={cn(primaryButton, 'px-4')}
            onClick={() => void (tab === 'photo' ? submitPhoto() : submitText())}
            disabled={busy || (tab === 'photo' ? !file : !text.trim())}
          >
            {busy ? 'Posting…' : 'Post story'}
          </button>
        </div>
      </div>
    </div>
  )
}
