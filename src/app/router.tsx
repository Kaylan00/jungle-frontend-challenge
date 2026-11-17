import type { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { NotFound } from '@/components/layout/not-found'
import { RouteError } from '@/components/layout/route-error'
import { routeTree } from '@/routeTree.gen'

export interface RouterContext {
  queryClient: QueryClient
}

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    // O loader só garante o dado no cache; quem decide frescor é o TanStack Query.
    defaultPreloadStaleTime: 0,
    defaultPreload: 'intent',
    scrollRestoration: true,
    defaultNotFoundComponent: () => <NotFound />,
    defaultErrorComponent: RouteError,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
