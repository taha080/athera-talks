import { useLayoutEffect, type ReactNode } from 'react'
import { APP_NAME } from '../lib/brand'
import { applyTheme, parseTheme } from '../lib/theme'
import { Logo } from './Logo'

export function AuthFrame({
  title,
  subtitle = 'Private messages and voice calls.',
  children,
  wide = false,
  privacy = false,
}: {
  title?: string
  subtitle?: string
  children: ReactNode
  wide?: boolean
  privacy?: boolean
}) {
  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.auth = 'true'
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#ffffff')
    return () => {
      delete root.dataset.auth
      applyTheme(parseTheme(root.getAttribute('data-theme')))
    }
  }, [])

  return (
    <div className="auth-canvas flex min-h-dvh flex-col px-4">
      <div className={`mx-auto flex w-full flex-1 flex-col justify-center py-8 ${wide ? 'max-w-lg' : 'max-w-[400px]'}`}>
        <div className="mb-6 text-center">
          <Logo className="mx-auto h-12 w-12" />
          <p className="mt-4 text-xl font-semibold tracking-tight text-paper">{APP_NAME}</p>
          <p className="mt-1 text-sm text-mist">{subtitle}</p>
        </div>
        <div className="rounded-xl border border-line bg-panel p-6 shadow-md">
          {title ? <h1 className="mb-4 text-base font-semibold text-paper">{title}</h1> : null}
          {children}
        </div>
      </div>
      <footer className="shrink-0 pb-5 pt-2 text-center text-xs leading-4 text-mist">
        Created by{' '}
        <a
          href="https://github.com/taha080"
          target="_blank"
          rel="noreferrer noopener"
          className="text-mist underline-offset-2 hover:underline"
        >
          Taha Ahsan
        </a>
        {privacy ? (
          <>
            <span aria-hidden="true"> · </span>
            <a href={`${import.meta.env.BASE_URL}privacy.html`} className="text-mist underline-offset-2 hover:underline">
              Privacy Policy
            </a>
          </>
        ) : null}
      </footer>
    </div>
  )
}
