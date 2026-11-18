import { useRouterState } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

/**
 * Anuncia a página nova para leitores de tela numa navegação dentro do app (no carregamento inicial o próprio
 * leitor já lê o título). Espera o título da página se assentar (ele chega depois dos dados, ex.: o nome do
 * NFT) e lê document.title numa região aria-live própria, separada dos avisos de ações (live-polite).
 */
export function RouteAnnouncer() {
  const pathname = useRouterState({ select: (s) => (s.resolvedLocation ?? s.location).pathname })
  const last = useRef(pathname)
  const [message, setMessage] = useState('')

  useEffect(() => {
    // Compara com a página anterior (e não "primeira execução"): o StrictMode roda o efeito duas vezes.
    if (last.current === pathname) return
    last.current = pathname
    const titleEl = document.querySelector('title')
    // Lê o título quando ele para de mudar; se ele mudar de novo logo depois (ex.: "Carregando NFT" e depois
    // o nome), lê outra vez. Passados alguns segundos da navegação, para de observar.
    let announced = ''
    const read = () => {
      if (document.title === announced) return
      announced = document.title
      setMessage(announced)
    }
    let timer = setTimeout(read, 500)
    const observer = new MutationObserver(() => {
      clearTimeout(timer)
      timer = setTimeout(read, 250)
    })
    if (titleEl) observer.observe(titleEl, { childList: true, characterData: true, subtree: true })
    const stop = setTimeout(() => observer.disconnect(), 4000)
    return () => {
      clearTimeout(timer)
      clearTimeout(stop)
      observer.disconnect()
    }
  }, [pathname])

  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-testid="route-announcer">
      {message}
    </div>
  )
}
