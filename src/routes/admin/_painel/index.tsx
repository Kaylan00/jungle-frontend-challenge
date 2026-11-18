import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { OverviewSection } from '@/features/admin/sections/overview-section'

/**
 * Visão geral do Kurio Admin. Endereços da primeira versão do painel (/admin?aba=cupons, /admin?q=...) são
 * levados para a seção certa da casca nova, para links antigos continuarem funcionando.
 */
export const Route = createFileRoute('/admin/_painel/')({
  validateSearch: z.object({
    aba: z.enum(['nfts', 'cupons']).optional().catch(undefined),
    q: z.string().max(80).optional().catch(undefined),
    pagina: z.number().int().min(1).optional().catch(undefined),
  }),
  beforeLoad: ({ search }) => {
    if (search.aba === 'cupons') throw redirect({ to: '/admin/cupons', replace: true })
    if (search.aba === 'nfts' || search.q || search.pagina) throw redirect({ to: '/admin/nfts', search: { q: search.q, pagina: search.pagina }, replace: true })
  },
  component: OverviewSection,
})
