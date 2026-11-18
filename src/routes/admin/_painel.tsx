import { createFileRoute, redirect } from '@tanstack/react-router'
import { sessionStore } from '@/api/session-store'
import { checkPanelAccess } from '@/features/admin/access'
import { PanelShellPending } from '@/features/admin/shell/panel-pending'
import { PanelShell } from '@/features/admin/shell/panel-shell'

/**
 * Casca do Kurio Admin (/admin, /admin/nfts, /admin/cupons, /admin/pedidos, /admin/usuarios).
 * Fora do layout da loja: sem cabeçalho, rodapé, barra inferior nem login por cima da página.
 * Sem sessão → /admin/entrar (guardando o endereço pedido). Sessão de conta comum → /admin/entrar com o aviso
 * de sem permissão (o 403 vem da API em GET /admin/me).
 * Enquanto o acesso é conferido aparece o skeleton da casca (o trilho e a seção pedida no lugar certo). Ele só
 * entra depois de 120 ms (navegação entre seções, com a sessão já em cache, nunca o vê) e, quando entra, fica
 * pelo menos 300 ms (sem piscar).
 */
export const Route = createFileRoute('/admin/_painel')({
  beforeLoad: async ({ context, location }) => {
    const access = await checkPanelAccess(context.queryClient)
    if (access.status === 'admin') return { admin: access.user }
    throw redirect({
      to: '/admin/entrar',
      search: {
        redirect: location.href,
        motivo: access.status === 'forbidden' ? 'sem-permissao' : sessionStore.isExpired() ? 'expirada' : undefined,
      },
      replace: true,
    })
  },
  component: PanelShell,
  pendingComponent: PanelShellPending,
  pendingMs: 120,
  pendingMinMs: 300,
})
