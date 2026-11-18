import { useEffect } from 'react'

export const STORE_BRAND = 'Kurio'
export const PANEL_BRAND = 'Kurio Admin'

/** Título da aba: "<página> · <marca>". */
export const pageTitle = (title: string, brand: string = STORE_BRAND) => `${title} · ${brand}`

/**
 * Título próprio de cada página (document.title). Enquanto `title` for undefined (dados carregando), o título
 * anterior fica. Ao desmontar (ex.: fechar a janela de login aberta sobre outra página), volta o que havia antes.
 * A troca de página é anunciada pelo <RouteAnnouncer /> (components/layout/route-announcer.tsx), que lê este título.
 */
export function usePageTitle(title: string | undefined, brand: string = STORE_BRAND) {
  useEffect(() => {
    if (!title) return
    const before = document.title
    document.title = pageTitle(title, brand)
    return () => {
      document.title = before
    }
  }, [title, brand])
}
