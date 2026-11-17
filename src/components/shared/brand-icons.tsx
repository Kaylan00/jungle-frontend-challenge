/** Ícones de marca (o lucide-react 1.x não traz logotipos de terceiros). */
export function LinkedinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3zM9 9h3.8v1.7h.1c.5-1 1.8-2 3.8-2 4 0 4.8 2.7 4.8 6.1V21h-4v-5.4c0-1.3 0-3-1.8-3s-2.1 1.4-2.1 2.9V21H9z" />
    </svg>
  )
}

export function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.3L5.3 21H2.2l7.2-8.3L2 3h6.4l4.4 5.8zm-1.1 16.2h1.7L7.4 4.7H5.5z" />
    </svg>
  )
}

/** Pássaro do Twitter, como no Figma da página de detalhe. */
export function TwitterIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 20" className={className} fill="currentColor" aria-hidden="true">
      <path d="M24 2.37a9.8 9.8 0 0 1-2.83.78A4.94 4.94 0 0 0 23.34.42a9.86 9.86 0 0 1-3.13 1.2A4.93 4.93 0 0 0 11.82 6.1 13.98 13.98 0 0 1 1.67.96a4.93 4.93 0 0 0 1.53 6.57 4.9 4.9 0 0 1-2.23-.61v.06a4.93 4.93 0 0 0 3.95 4.83 4.95 4.95 0 0 1-2.22.08 4.93 4.93 0 0 0 4.6 3.42A9.88 9.88 0 0 1 0 17.35 13.94 13.94 0 0 0 7.55 19.56c9.05 0 14-7.5 14-14 0-.21 0-.42-.01-.63A10 10 0 0 0 24 2.37z" />
    </svg>
  )
}
