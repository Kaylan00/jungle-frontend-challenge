import type { QueryClient } from '@tanstack/react-query'
import { createRouter, type ParsedLocation } from '@tanstack/react-router'
import { NotFound } from '@/components/layout/not-found'
import { RouteError } from '@/components/layout/route-error'
import { trackPreviousPage } from '@/lib/back-navigation'
import { routeTree } from '@/routeTree.gen'

export interface RouterContext {
  queryClient: QueryClient
  /**
   * Última página exibida (durante uma navegação, a página de onde a pessoa está saindo). O guard das rotas
   * privadas usa para abrir o login por cima dela (features/auth/auth-overlay.ts).
   */
  currentPage: () => ParsedLocation | undefined
}

export function createAppRouter(queryClient: QueryClient) {
  const ref: { router?: { state: { resolvedLocation?: ParsedLocation } } } = {}
  const router = createRouter({
    routeTree,
    context: { queryClient, currentPage: () => ref.router?.state.resolvedLocation },
    // O loader só garante o dado no cache; quem decide frescor é o TanStack Query.
    defaultPreloadStaleTime: 0,
    defaultPreload: 'intent',
    scrollRestoration: true,
    defaultNotFoundComponent: () => <NotFound />,
    defaultErrorComponent: RouteError,
  })
  ref.router = router
  // Seta "voltar" das telas mobile: lembra de qual página veio cada navegação (lib/back-navigation.ts).
  trackPreviousPage(router)
  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
