import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { nftDetailQuery } from '@/api/queries'
import { NftDetailPage } from '@/features/nft/nft-detail-page'

export const Route = createFileRoute('/nft/$nftId')({
  // Edição escolhida fica na URL: refresh e link compartilhado mantêm a seleção.
  validateSearch: z.object({ edicao: z.string().optional().catch(undefined) }),
  // Começa a buscar já na navegação (sem bloquear): o componente mostra o skeleton enquanto isso.
  loader: ({ context, params }) => {
    void context.queryClient.prefetchQuery(nftDetailQuery(params.nftId))
  },
  component: DetailRoute,
})

function DetailRoute() {
  const { nftId } = Route.useParams()
  const { edicao } = Route.useSearch()
  return <NftDetailPage nftId={nftId} editionId={edicao} />
}
