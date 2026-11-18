import { createFileRoute } from '@tanstack/react-router'
import { featuredQuery, nftListQuery } from '@/api/queries'
import { HomePage } from '@/features/catalog/home-page'
import { toListParams, validateCatalogSearch } from '@/features/catalog/search-params'

export const Route = createFileRoute('/')({
  // Busca, filtros, ordenação e página vivem na URL (validados com zod, com cache por entrada).
  validateSearch: validateCatalogSearch,
  loaderDeps: ({ search }) => ({ search }),
  // Começa a buscar já na navegação (sem bloquear), em paralelo com o download da página: os destaques e a
  // página do catálogo não esperam o componente montar. Mesmas chaves do useQuery da página (mesmo cache).
  loader: ({ context, deps }) => {
    void context.queryClient.prefetchQuery(featuredQuery)
    void context.queryClient.prefetchQuery(nftListQuery(toListParams(deps.search)))
  },
  component: HomeRoute,
})

function HomeRoute() {
  const search = Route.useSearch()
  return <HomePage search={search} />
}
