import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { sessionQuery } from '@/api/queries'
import { sessionStore } from '@/api/session-store'
import { authNavigation } from '@/features/auth/auth-overlay'
import { PrivatePagePending } from '@/features/auth/private-pending'

/**
 * Layout das rotas privadas (checkout, pedido, perfil, carteiras, favoritos).
 * Antes de carregar, confere a sessão na API. Sem sessão: abre o login levando o endereço pedido em
 * `redirect`, para seguir até ele depois de entrar. Vindo de uma página pública (carrinho, detalhe, início),
 * o login abre por cima dela e a barra mostra /login; acesso direto ou refresh: rota /login comum.
 * Enquanto confere (acesso direto ou refresh com a API lenta): a página pedida em skeleton, dentro do layout
 * da loja, em vez de uma tela vazia. Só entra depois de 120 ms (navegação com a sessão em cache não vê) e fica
 * pelo menos 300 ms.
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
  pendingComponent: PrivatePagePending,
  pendingMs: 120,
  pendingMinMs: 300,
})
