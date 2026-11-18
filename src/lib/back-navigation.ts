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

/**
 * Chamado uma vez ao criar o router: guarda a página de onde veio cada navegação, já no início dela.
 * Não usa o fim da navegação: quem volta antes de uma página terminar de carregar (pagamento conferindo a
 * sessão) também passou por ela, e o `fromLocation` dos eventos é a última página que terminou de carregar.
 */
export function trackPreviousPage(router: AnyRouter) {
  let currentPath = router.state.location.pathname
  return router.subscribe('onBeforeNavigate', ({ toLocation }) => {
    if (toLocation.pathname === currentPath) return
    previousPath = currentPath
    currentPath = toLocation.pathname
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
