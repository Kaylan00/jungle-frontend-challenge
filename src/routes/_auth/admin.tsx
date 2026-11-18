import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { AdminPage } from '@/features/admin/admin-page'

/**
 * Painel administrativo. Fica sob o layout `_auth` (sem sessão → login por cima da página de origem ou rota
 * /login). O papel é conferido pela API em cada chamada: conta comum recebe 403 e vê "Sem permissão".
 * Aba, busca e página ficam na URL (refresh e voltar mantêm).
 */
export const Route = createFileRoute('/_auth/admin')({
  validateSearch: z.object({
    aba: z.enum(['nfts', 'cupons']).optional().catch(undefined),
    q: z.string().max(80).optional().catch(undefined),
    pagina: z.number().int().min(1).optional().catch(undefined),
  }),
  component: AdminRoute,
})

function AdminRoute() {
  const search = Route.useSearch()
  return <AdminPage search={search} />
}
