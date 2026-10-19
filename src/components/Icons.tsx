type IconProps = { className?: string }

export function GoogleIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8A6.4 6.4 0 1 1 12 5.6c1.8 0 3 .8 3.7 1.5l2.5-2.4C16.7 3.2 14.6 2.2 12 2.2 6.9 2.2 2.8 6.3 2.8 11.4S6.9 20.6 12 20.6c5.4 0 9-3.8 9-9.1 0-.6 0-1.1-.1-1.6H12z" />
    </svg>
  )
}

export function PhoneIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 3.8h2.2l1.2 3-1.6 1a12 12 0 0 0 5.4 5.4l1-1.6 3 1.2V17a2 2 0 0 1-2.2 2A15.2 15.2 0 0 1 5 6a2 2 0 0 1 2-2.2z" />
    </svg>
  )
}

export function MicIcon({ className, off = false }: IconProps & { off?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" d="M12 4a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-5 0v-5A2.5 2.5 0 0 1 12 4z" />
      <path strokeLinecap="round" d="M7 11.5a5 5 0 0 0 10 0M12 16.5V20" />
      {off ? <path strokeLinecap="round" d="M5 5l14 14" /> : null}
    </svg>
  )
}

export function EndIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4.2 13.6c1.8-1.6 4.2-2.6 7.8-2.6s6 .9 7.8 2.6c.4.3.4.9 0 1.3l-1.5 1.4c-.4.3-.9.3-1.2-.1l-.8-1.1a8 8 0 0 0-8.6 0l-.8 1.1c-.3.4-.8.4-1.2.1l-1.5-1.4c-.4-.4-.4-1 0-1.3z" />
    </svg>
  )
}

export function BackIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 5l-7 7 7 7" />
    </svg>
  )
}

export function SearchIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="11" cy="11" r="6" />
      <path strokeLinecap="round" d="M16 16l4 4" />
    </svg>
  )
}

export function SendIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4 12.4 19.2 5.2c.7-.3 1.4.4 1.1 1.1l-4.6 13.2c-.3.8-1.4.8-1.7 0l-2.2-5.3-5.3-2.2c-.8-.3-.8-1.4 0-1.6z" />
    </svg>
  )
}

export function CheckIcon({ className, double = false }: IconProps & { double?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={double ? 'M2 12.5l4 4 6-7M10 13.5l2 2 8-9' : 'M5 12.5l4 4 10-11'} />
    </svg>
  )
}
