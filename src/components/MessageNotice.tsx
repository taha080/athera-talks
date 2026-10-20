import { useRef, useState, type PointerEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useChat } from '../context/ChatContext'
import { Avatar } from './Avatar'
import { DisplayName } from './CreatorBadge'
import { CloseIcon } from './Icons'

export function MessageNotices() {
  const { notices, dismissNotice } = useChat()
  const navigate = useNavigate()
  if (notices.length === 0) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-3" aria-live="polite">
      {notices.map((notice) => (
        <NoticeCard
          key={notice.id}
          notice={notice}
          onOpen={() => {
            dismissNotice(notice.id)
            navigate(`/c/${notice.conversationId}`)
          }}
          onDismiss={() => dismissNotice(notice.id)}
        />
      ))}
    </div>
  )
}

function NoticeCard({
  notice,
  onOpen,
  onDismiss,
}: {
  notice: {
    id: string
    senderName: string
    senderCreator: boolean
    senderPremium?: boolean
    avatarUrl: string | null
    preview: string
    groupTitle: string | null
  }
  onOpen: () => void
  onDismiss: () => void
}) {
  const origin = useRef<{ x: number; y: number; dx: number; dy: number } | null>(null)
  const [shift, setShift] = useState({ x: 0, y: 0 })

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0) return
    const target = event.target
    if (target instanceof Element && target.closest('button')) return
    event.currentTarget.setPointerCapture(event.pointerId)
    origin.current = { x: event.clientX, y: event.clientY, dx: 0, dy: 0 }
  }

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    if (!origin.current) return
    origin.current.dx = event.clientX - origin.current.x
    origin.current.dy = event.clientY - origin.current.y
    setShift({ x: origin.current.dx, y: Math.min(0, origin.current.dy) })
  }

  function onPointerUp() {
    if (!origin.current) return
    const { dx, dy } = origin.current
    origin.current = null
    if (dy < -36 || Math.abs(dx) > 72) {
      onDismiss()
      return
    }
    if (Math.hypot(dx, dy) < 8) onOpen()
    setShift({ x: 0, y: 0 })
  }

  return (
    <article
      data-message-notice="true"
      className="msg-notice notice-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-3 py-2.5"
      style={shift.x || shift.y ? { transform: `translate(${shift.x}px, ${shift.y}px)` } : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <Avatar name={notice.senderName} url={notice.avatarUrl} size="sm" creator={notice.senderCreator} premium={notice.senderPremium} />
      <div className="min-w-0 flex-1 pt-0.5">
        <DisplayName name={notice.senderName} creator={notice.senderCreator} premium={notice.senderPremium} className="text-sm font-semibold" />
        {notice.groupTitle ? <p className="notice-group truncate text-xs">{notice.groupTitle}</p> : null}
        <p className="notice-preview truncate text-sm">{notice.preview}</p>
      </div>
      <button type="button" className="notice-close grid h-7 w-7 shrink-0 place-items-center rounded-full" aria-label="Dismiss notification" onClick={onDismiss}>
        <CloseIcon className="h-4 w-4" />
      </button>
    </article>
  )
}
