// Original geometric kunai. It is a simple blade shape, not a copied crest.
export function KunaiMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path fill="currentColor" d="M24 2.5 33 20h-6.2l.7 12.2h5.3v3.6H15.2v-3.6h5.3L21.2 20H15L24 2.5z" />
      <circle cx="24" cy="41.5" r="4.2" stroke="currentColor" strokeWidth="2.2" />
    </svg>
  )
}
