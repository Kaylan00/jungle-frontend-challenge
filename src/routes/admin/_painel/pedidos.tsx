import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { OrderStatus } from '@/api/contracts'
import { OrdersSection } from '@/features/admin/sections/orders-section'

/** Pedidos de todas as contas (GET /admin/orders). Filtro, busca e página na URL. */
export const Route = createFileRoute('/admin/_painel/pedidos')({
  validateSearch: z.object({
    status: OrderStatus.optional().catch(undefined),
    q: z.string().max(80).optional().catch(undefined),
    pagina: z.number().int().min(1).optional().catch(undefined),
  }),
  component: PedidosRoute,
})

function PedidosRoute() {
  return <OrdersSection search={Route.useSearch()} />
}
