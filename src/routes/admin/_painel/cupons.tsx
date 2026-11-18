import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { CouponsSection } from '@/features/admin/sections/coupons-section'

/** Cupons. `codigo` vem da busca global: destaca e rola até o cupom escolhido. */
export const Route = createFileRoute('/admin/_painel/cupons')({
  validateSearch: z.object({ codigo: z.string().max(40).optional().catch(undefined) }),
  component: CuponsRoute,
})

function CuponsRoute() {
  const { codigo } = Route.useSearch()
  return <CouponsSection highlight={codigo} />
}
