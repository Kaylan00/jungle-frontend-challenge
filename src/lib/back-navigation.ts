import { useRouter, type AnyRouter } from '@tanstack/react-router'

/**
 * Seta "Voltar" das telas mobile com destino lógico, não só o histórico do navegador.
 *
 * `history.back()` puro prende a pessoa em ciclos: quem foi do carrinho ao pagamento e voltou ao carrinho,
 * ao tocar "voltar" no carrinho, caía de novo no pagamento. Aqui o app lembra de qual página veio a
 * navegação atual; se ela for uma das páginas a evitar (fluxo de compra, login), ou se não houver página
 * anterior do próprio app (acesso direto), vai para o destino padrão em vez de voltar.
 */
let previousPath: string | null = null

/** Chamado uma vez ao criar o router: guarda a página de onde veio cada navegação concluída. */
export function trackPreviousPage(router: AnyRouter) {
  return router.subscribe('onResolved', ({ fromLocation, toLocation }) => {
    if (fromLocation && fromLocation.pathname !== toLocation.pathname) previousPath = fromLocation.pathname
  })
}

export function useSmartBack({ fallback = '/', avoid = [] }: { fallback?: string; avoid?: string[] } = {}) {
  const router = useRouter()
  return () => {
    const here = router.state.location.pathname
    const prev = previousPath
    const canGoBack = !!prev && prev !== here && !avoid.some((p) => prev === p || prev.startsWith(`${p}/`))
    if (canGoBack) router.history.back()
    else void router.navigate({ to: fallback })
  }
}

/** Páginas para onde a seta "voltar" nunca deve levar de volta (fluxo de compra e conta). */
export const FLOW_PAGES = ['/pagamento', '/pedido', '/login', '/cadastro', '/recuperar-senha', '/redefinir-senha', '/admin']
