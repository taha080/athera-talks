// Original leaf-and-ring mark. It is not the Hidden Leaf crest.
export function LeafMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <circle cx="32" cy="32" r="27" stroke="currentColor" strokeWidth="2.4" />
      <circle cx="32" cy="32" r="21" stroke="currentColor" strokeWidth="1.2" opacity="0.45" />
      <path
        d="M32 13c8 9 13 18 13 27.2C45 48.6 39.4 55 32 57.4 24.6 55 19 48.6 19 40.2 19 31 24 22 32 13z"
        fill="currentColor"
      />
      <path d="M32 20v30" stroke="#1a100c" strokeWidth="1.7" strokeLinecap="round" />
      <path
        d="M32 28c-4.2 2.2-6.4 4.4-7.4 7.2M32 35c4 1.6 6.6 3.6 8 6.4"
        stroke="#1a100c"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  )
}
