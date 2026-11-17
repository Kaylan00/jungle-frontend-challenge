import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { sessionQuery } from '@/api/queries'
import { sessionStore } from '@/api/session-store'

/**
 * Layout das rotas privadas (checkout, pedido, perfil, carteiras, favoritos).
 * Antes de carregar, confere a sessão na API. Sem sessão: vai para o login levando
 * o endereço atual em `redirect`, para voltar ao mesmo ponto depois de entrar.
 */
export const Route = createFileRoute('/_auth')({
  beforeLoad: async ({ context, location }) => {
    const session = await context.queryClient.ensureQueryData(sessionQuery)
    if (!session) {
      throw redirect({ to: '/login', search: { redirect: location.href, reason: sessionStore.isExpired() ? 'expired' : undefined } })
    }
    return { user: session.user }
  },
  component: Outlet,
})
