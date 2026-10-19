import { Link } from 'react-router-dom'
import { primaryButton } from '../lib/styles'

export function NotFoundPage() {
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <p className="text-sm font-medium text-mist">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">This page does not exist</h1>
        <p className="mt-2 text-sm text-mist">The link may be old, or the chat was removed.</p>
        <Link to="/" className={`${primaryButton} mt-6`}>
          Back to chats
        </Link>
      </div>
    </div>
  )
}
