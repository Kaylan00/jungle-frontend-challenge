import { createFileRoute, notFound } from '@tanstack/react-router'
import { ComingSoonPage } from '@/features/profile/coming-soon-page'
import { isSoonSection } from '@/features/profile/soon-sections'

/** Itens do menu do perfil ainda fora do escopo (/perfil/atividade, /perfil/ofertas...): tela "Em breve". */
export const Route = createFileRoute('/_auth/perfil/$secao')({
  beforeLoad: ({ params }) => {
    if (!isSoonSection(params.secao)) throw notFound()
  },
  component: SoonRoute,
})

function SoonRoute() {
  const { secao } = Route.useParams()
  return isSoonSection(secao) ? <ComingSoonPage section={secao} /> : null
}
