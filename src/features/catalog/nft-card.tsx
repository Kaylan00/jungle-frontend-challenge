import { Link } from '@tanstack/react-router'
import type { NftSummary } from '@/api/contracts'
import { Skeleton } from '@/components/ui/skeleton'
import { FavoriteButton } from '@/features/favorites/favorite-button'
import { formatEth } from '@/lib/eth'
import { cn } from '@/lib/utils'

export function NftCard({ nft, priority = false, className }: { nft: NftSummary; priority?: boolean; className?: string }) {
  const soldOut = nft.available === 0
  return (
    <article className={cn('group relative', className)} data-testid="nft-card" data-nft-id={nft.id}>
      {/* Figma: caixa marrom 258x300 com a arte 250x250 centrada (cantos de 12px). */}
      <div className="relative overflow-hidden bg-card p-1.5 md:px-1 md:py-[25px]">
        {nft.badge === 'raro' && <span className="sr-only">Raro.</span>}
        {soldOut && (
          <span className="absolute left-1 top-1 z-10 rounded-sm bg-secondary px-2 py-0.5 text-[11px] font-bold uppercase text-foreground">Esgotado</span>
        )}
        {/* Favoritar: some no layout do Figma; aparece ao passar o mouse, no foco ou quando já está favoritado. */}
        <div className="absolute right-3 top-3 z-10 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 has-[[aria-pressed=true]]:opacity-100">
          <FavoriteButton nftId={nft.id} nftName={nft.name} size="sm" />
        </div>
        <img
          src={nft.image}
          alt={`Arte do NFT ${nft.name}`}
          width={250}
          height={250}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding="async"
          className={cn('aspect-square w-full rounded-xl object-cover transition-transform duration-300 group-hover:scale-[1.02]', soldOut && 'opacity-60')}
        />
      </div>
      <h3 className="mt-2 truncate text-base leading-6">
        {/* O link cobre o card inteiro (área de clique grande), mantendo um único item focável. */}
        <Link to="/nft/$nftId" params={{ nftId: nft.id }} className="outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring">
          {nft.name}
        </Link>
      </h3>
      <p className="mt-1 text-lg font-bold leading-6 text-highlight">
        <span data-testid="nft-price">{formatEth(nft.price, { maxDecimals: 4 })}</span>
        {nft.compareAtPrice && (
          <s className="ml-[11px] font-normal text-[#b39463] no-underline">
            <span className="sr-only">Preço anterior: </span>
            {formatEth(nft.compareAtPrice)}
          </s>
        )}
      </p>
    </article>
  )
}

export function NftCardSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="bg-card p-1.5 md:px-1 md:py-[25px]">
        <Skeleton className="aspect-square w-full rounded-xl" />
      </div>
      <Skeleton className="mt-2 h-6 w-3/4" />
      <Skeleton className="mt-1 h-6 w-1/3" />
    </div>
  )
}
