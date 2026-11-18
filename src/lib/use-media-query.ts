import { useSyncExternalStore } from 'react'

/** Mesmo corte do Tailwind (md = 48rem): a partir daqui o layout é o de desktop. */
export const DESKTOP_QUERY = '(min-width: 48rem)'

/**
 * Se a media query casa agora, e re-renderiza quando muda (girar o aparelho, redimensionar a janela).
 * Usado para nem montar o que só existe num dos layouts (cabeçalho, rodapé e filtros laterais do desktop,
 * barra inferior do mobile): esconder com CSS ainda cria e mede toda essa árvore. O valor inicial já vem
 * certo no primeiro render (matchMedia é síncrono), então não há troca de layout depois de montar.
 */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

export const useIsDesktop = () => useMediaQuery(DESKTOP_QUERY)
