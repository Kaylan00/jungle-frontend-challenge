/**
 * Página "Lista de interesse" (/perfil/favoritos): os NFTs que o usuário favoritou.
 * A API de favoritos devolve só os ids; cada NFT é buscado com a mesma consulta da página de
 * detalhe (useQueries), então o que já está em cache aparece na hora e o resto carrega em paralelo.
 * Desfavoritar pelo coração do card atualiza a lista de forma otimista (o card some na hora).
 */
import { useQueries } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { TrendingDown } from 'lucide-react'
import { ApiError } from '@/api/http'
import { nftDetailQuery } from '@/api/queries'
import { EmptyState, ErrorState } from '@/components/shared/error-state'
import { buttonVariants } from '@/components/ui/button'
import { NftCard, NftCardSkeleton } from '@/features/catalog/nft-card'
import { useSession } from '@/features/auth/use-session'
import { useFavorites } from '@/features/favorites/hooks'
import { usePriceDrops } from '@/features/favorites/price-drops'
import { formatEth } from '@/lib/eth'
import { ProfileLayout } from './profile-layout'

const gridClass = 'grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4'

export function FavoritesPage() {
  const favorites = useFavorites()
  const { user } = useSession()
  // Selo "Preço caiu" dos favoritos que baixaram de preço nesta sessão (ver features/favorites/price-drops.ts).
  const drops = usePriceDrops(user?.id ?? null)
  const ids = favorites.data?.nftIds ?? []
  const details = useQueries({ queries: ids.map((id) => nftDetailQuery(id)) })

  const loaded = details.flatMap((q) => (q.data ? [q.data] : []))
  const loadingCount = details.filter((q) => q.isPending).length
  const failed = details.filter((q) => q.isError)

  return (
    <ProfileLayout title="Lista de interesse">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 className="text-[14px] font-bold">Lista de interesse</h2>
        {favorites.isSuccess && ids.length > 0 && (
          <p className="text-[13px] text-muted-foreground">
            {ids.length} {ids.length === 1 ? 'NFT salvo' : 'NFTs salvos'}
          </p>
        )}
      </div>

      {favorites.isPending ? (
        <div className={gridClass} aria-busy="true">
          <p className="sr-only">Carregando lista de interesse…</p>
          {Array.from({ length: 4 }, (_, i) => (
            <NftCardSkeleton key={i} />
          ))}
        </div>
      ) : favorites.isError ? (
        <ErrorState
          title="Não foi possível carregar sua lista de interesse"
          message={favorites.error instanceof ApiError ? favorites.error.message : undefined}
          onRetry={() => void favorites.refetch()}
          retrying={favorites.isFetching}
        />
      ) : ids.length === 0 ? (
        <EmptyState
          title="Sua lista de interesse está vazia"
          message="Toque no coração de um NFT no catálogo para guardá-lo aqui."
          action={
            <Link to="/" hash="catalogo" className={buttonVariants()}>
              Explorar o catálogo
            </Link>
          }
        />
      ) : (
        <>
          <ul className={gridClass} data-testid="favorites-grid" aria-busy={loadingCount > 0 || undefined} data-reveal-group>
            {loaded.map((nft) => {
              const drop = drops[nft.id]
              return (
                <li key={nft.id}>
                  <NftCard nft={nft} />
                  {drop && (
                    <p
                      className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[12px] font-semibold leading-4 text-success max-md:mx-2"
                      data-testid="price-drop-badge"
                    >
                      <TrendingDown className="size-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate" aria-hidden="true">
                        Caiu de {formatEth(drop.from)}
                      </span>
                      <span className="sr-only">
                        Preço caiu de {formatEth(drop.from)} para {formatEth(drop.to)}
                      </span>
                    </p>
                  )}
                </li>
              )
            })}
            {Array.from({ length: loadingCount }, (_, i) => (
              <li key={`loading-${i}`} aria-hidden="true">
                <NftCardSkeleton />
              </li>
            ))}
          </ul>
          {failed.length > 0 && (
            <ErrorState
              className="mt-6"
              title={failed.length === 1 ? 'Um NFT da lista não carregou' : `${failed.length} NFTs da lista não carregaram`}
              onRetry={() => failed.forEach((q) => void q.refetch())}
              retrying={failed.some((q) => q.isFetching)}
            />
          )}
        </>
      )}
    </ProfileLayout>
  )
}
