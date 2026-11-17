/**
 * Anúncios para leitores de tela (aria-live).
 * Mutations e eventos de tempo real chamam `announce()`; o <LiveAnnouncer /> do layout lê a fila.
 */
type Listener = (message: string, politeness: 'polite' | 'assertive') => void

const listeners = new Set<Listener>()

export function announce(message: string, politeness: 'polite' | 'assertive' = 'polite') {
  listeners.forEach((l) => l(message, politeness))
}

export function subscribeAnnouncements(fn: Listener) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
