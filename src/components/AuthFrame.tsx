import type { ReactNode } from 'react'
import { APP_NAME } from '../lib/brand'
import { Credit } from './Credit'
import { Logo } from './Logo'

export function AuthFrame({
  title,
  subtitle = 'Private messages and voice calls.',
  children,
  wide = false,
}: {
  title?: string
  subtitle?: string
  children: ReactNode
  wide?: boolean
}) {
  return (
    <div className="auth-canvas grid min-h-dvh place-items-center px-4 py-10">
      <div className={wide ? 'w-full max-w-lg' : 'w-full max-w-[400px]'}>
        <div className="mb-6 text-center">
          <Logo className="mx-auto h-12 w-12" />
          <p className="mt-4 text-xl font-semibold tracking-tight text-paper">{APP_NAME}</p>
          <p className="mt-1 text-sm text-mist">{subtitle}</p>
        </div>
        <div className="rounded-xl border border-line bg-panel p-6 shadow-md">
          {title ? <h1 className="mb-4 text-base font-semibold text-paper">{title}</h1> : null}
          {children}
        </div>
        <Credit className="mt-6" />
      </div>
    </div>
  )
}
