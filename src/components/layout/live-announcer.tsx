import { useEffect, useState } from 'react'
import { subscribeAnnouncements } from '@/lib/announcer'

/** Duas regiões aria-live (educada e urgente) que leem o que `announce()` publica. */
export function LiveAnnouncer() {
  const [polite, setPolite] = useState('')
  const [assertive, setAssertive] = useState('')

  useEffect(
    () =>
      subscribeAnnouncements((message, politeness) => {
        const set = politeness === 'assertive' ? setAssertive : setPolite
        // Limpa e reescreve: a mesma frase repetida também é anunciada.
        set('')
        requestAnimationFrame(() => set(message))
      }),
    [],
  )

  return (
    <>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-testid="live-polite">
        {polite}
      </div>
      <div role="alert" aria-live="assertive" aria-atomic="true" className="sr-only" data-testid="live-assertive">
        {assertive}
      </div>
    </>
  )
}
