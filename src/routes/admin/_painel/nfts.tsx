import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { NftsSection } from '@/features/admin/sections/nfts-section'

/** NFTs e edições. Busca, página e o NFT aberto ficam na URL (refresh e voltar mantêm). */
export const Route = createFileRoute('/admin/_painel/nfts')({
  validateSearch: z.object({
    q: z.string().max(80).optional().catch(undefined),
    pagina: z.number().int().min(1).optional().catch(undefined),
    /** NFT com as edições abertas (a busca global leva direto a ele) */
    abrir: z.string().max(40).optional().catch(undefined),
  }),
  component: NftsRoute,
})

function NftsRoute() {
  return <NftsSection search={Route.useSearch()} />
}
