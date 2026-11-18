import type { QueryClient } from '@tanstack/react-query'
import { markAppSettled } from '@/lib/motion'
import type { createAppRouter } from './router'

/** Teto para a primeira tela: com a API lenta (ou uma consulta presa), o trabalho opcional não espera para sempre. */
const MAX_WAIT_MS = 6_000
/** Folga entre o último aviso e a conferência: dá tempo de o React montar a tela com os dados que chegaram. */
const DEBOUNCE_MS = 50

/**
 * Avisa (lib/motion.ts, `markAppSettled`) quando a primeira tela está pronta: a rota inicial carregou e
 * nenhuma consulta está em andamento. A partir daí o trabalho opcional (GSAP, rolagem suave, slides extras
 * do destaque) pode rodar no próximo momento ocioso sem atrasar o LCP. Devolve a função de limpeza.
 */
export function watchAppSettled(queryClient: QueryClient, router: ReturnType<typeof createAppRouter>) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let done = false
  const finish = () => {
    if (done) return
    done = true
    markAppSettled()
    cleanup()
  }
  const check = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      const { resolvedLocation, status, isLoading } = router.state
      if (resolvedLocation && status === 'idle' && !isLoading && queryClient.isFetching() === 0) finish()
    }, DEBOUNCE_MS)
  }
  const unsubscribeQueries = queryClient.getQueryCache().subscribe(check)
  const unsubscribeRouter = router.subscribe('onResolved', check)
  const fallback = setTimeout(finish, MAX_WAIT_MS)
  function cleanup() {
    clearTimeout(timer)
    clearTimeout(fallback)
    unsubscribeQueries()
    unsubscribeRouter()
  }
  check()
  return cleanup
}
