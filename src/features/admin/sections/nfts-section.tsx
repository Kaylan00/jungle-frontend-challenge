import { ADMIN_PAGE_SIZE } from '@/api/queries'
import { AdminNfts, type NftsSearch } from '../admin-nfts'
import { useAdminNfts } from '../hooks'
import { PanelPage } from '../shell/panel-page'
import { sectionMeta } from '../shell/sections'

const META = sectionMeta('/admin/nfts')

/** NFTs: busca, paginação, edição de cada edição (com 409 de versão) e destaque na vitrine. */
export function NftsSection({ search }: { search: NftsSearch }) {
  const query = useAdminNfts({ q: search.q || undefined, page: search.pagina, pageSize: ADMIN_PAGE_SIZE })
  return (
    <PanelPage eyebrow={META.eyebrow} title={META.label} description={META.intro}>
      <AdminNfts query={query} search={search} />
    </PanelPage>
  )
}
