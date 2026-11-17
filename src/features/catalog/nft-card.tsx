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
      <div className="relative overflow-hidden rounded-md bg-card p-1.5">
        {nft.badge === 'raro' && (
          <span className="absolute left-1.5 top-1.5 z-10 rounded-sm bg-primary px-2 py-0.5 text-[11px] font-bold uppercase text-primary-foreground">Raro</span>
        )}
        {soldOut && (
          <span className="absolute left-1.5 top-1.5 z-10 rounded-sm bg-secondary px-2 py-0.5 text-[11px] font-bold uppercase text-foreground">Esgotado</span>
        )}
        <div className="absolute right-3 top-3 z-10">
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
          className={cn('aspect-square w-full rounded-md object-cover transition-transform duration-300 group-hover:scale-[1.02]', soldOut && 'opacity-60')}
        />
      </div>
      <h3 className="mt-2.5 truncate text-[15px]">
        {/* O link cobre o card inteiro (área de clique grande), mantendo um único item focável. */}
        <Link to="/nft/$nftId" params={{ nftId: nft.id }} className="outline-none after:absolute after:inset-0 after:rounded-md focus-visible:after:ring-2 focus-visible:after:ring-ring">
          {nft.name}
        </Link>
      </h3>
      <p className="mt-0.5 text-[15px] font-bold text-primary">
        <span data-testid="nft-price">{formatEth(nft.price, { maxDecimals: 4 })}</span>
        {nft.compareAtPrice && (
          <s className="ml-2 font-normal text-muted-foreground">
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
      <div className="rounded-md bg-card p-1.5">
        <Skeleton className="aspect-square w-full" />
      </div>
      <Skeleton className="mt-2.5 h-5 w-3/4" />
      <Skeleton className="mt-1.5 h-5 w-1/3" />
    </div>
  )
}
