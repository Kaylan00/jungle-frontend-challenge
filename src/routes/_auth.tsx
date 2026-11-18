import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { sessionQuery } from '@/api/queries'
import { sessionStore } from '@/api/session-store'
import { authNavigation } from '@/features/auth/auth-overlay'

/**
 * Layout das rotas privadas (checkout, pedido, perfil, carteiras, favoritos).
 * Antes de carregar, confere a sessão na API. Sem sessão: abre o login levando o endereço pedido em
 * `redirect`, para seguir até ele depois de entrar. Vindo de uma página pública (carrinho, detalhe, início),
 * o login abre por cima dela e a barra mostra /login; acesso direto ou refresh: rota /login comum.
 */
export const Route = createFileRoute('/_auth')({
  beforeLoad: async ({ context, location }) => {
    const session = await context.queryClient.ensureQueryData(sessionQuery)
    if (!session) {
      const reason = sessionStore.isExpired() ? 'expired' : undefined
      throw redirect(authNavigation(context.currentPage(), 'login', { redirect: location.href, reason }))
    }
    return { user: session.user }
  },
  component: Outlet,
})
