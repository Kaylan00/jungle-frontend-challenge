import { ADMIN_PAGE_SIZE } from '@/api/queries'
import { AdminNfts, type NftsSearch } from '../admin-nfts'
import { useAdminNfts } from '../hooks'
import { PanelPage } from '../shell/panel-page'

/** NFTs: busca, paginação, edição de cada edição (com 409 de versão) e destaque na vitrine. */
export function NftsSection({ search }: { search: NftsSearch }) {
  const query = useAdminNfts({ q: search.q || undefined, page: search.pagina, pageSize: ADMIN_PAGE_SIZE })
  return (
    <PanelPage
      eyebrow="Catálogo"
      title="NFTs"
      description="Preço, estoque e status de cada edição, e o destaque na vitrine. Cada mudança chega ao vivo a quem está navegando ou comprando, inclusive em outras abas."
    >
      <AdminNfts query={query} search={search} />
    </PanelPage>
  )
}
