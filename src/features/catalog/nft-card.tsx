import { Link } from '@tanstack/react-router'
import type { NftSummary } from '@/api/contracts'
import { Skeleton } from '@/components/ui/skeleton'
import { FavoriteButton } from '@/features/favorites/favorite-button'
import { formatEth } from '@/lib/eth'
import { cn } from '@/lib/utils'

/**
 * variant: "detail" e "cart" são os cards das vitrines "Mais desta coleção" e "Colecionadores também viram"
 * (Figma desktop: caixa 219x255 e textos de 15/16px), que só valem a partir de xl.
 */
export function NftCard({ nft, priority = false, className, variant = 'catalog' }: { nft: NftSummary; priority?: boolean; className?: string; variant?: 'catalog' | 'detail' | 'cart' }) {
  const soldOut = nft.available === 0
  const detail = variant === 'detail'
  const cart = variant === 'cart'
  return (
    <article className={cn('group relative', className)} data-testid="nft-card" data-nft-id={nft.id}>
      {/* Figma: caixa marrom 258x300 com a arte 250x250 centrada (cantos de 12px).
          Mobile (Figma 414): caixa de 175x200 com raio de 18px; a arte fica 12px abaixo do topo na coluna
          da esquerda e 20px na da direita (a coluna da direita desce 32px na grade). */}
      <div
        className={cn(
          'relative overflow-hidden bg-card px-1 pb-5 pt-3 max-md:rounded-[18px] max-md:bg-[#271813] max-md:[li:nth-child(even)_&]:pb-3 max-md:[li:nth-child(even)_&]:pt-5 md:py-[25px]',
          // Detalhe: Frame 197 (255 de altura, padding 16/4/28/4). Carrinho: Artwork 219x255 com a arte 212 centrada.
          // Acima de 1440 os cards ficam mais largos: a altura acompanha a arte (mesmos respiros do Figma).
          detail && 'xl:h-[255px] xl:pb-[28px] xl:pt-4 min-[1441px]:h-auto!',
          cart && 'xl:flex xl:h-[255px] xl:items-center xl:justify-center xl:p-0 min-[1441px]:h-auto! min-[1441px]:py-[21.5px]!',
        )}
      >
        {nft.badge === 'raro' && <span className="sr-only">Raro.</span>}
        {nft.badge === 'raro' && (
          <span aria-hidden="true" className="absolute left-0 top-3 z-10 flex h-[31px] w-[68px] items-center bg-primary pl-2 text-[13px] font-medium uppercase text-primary-foreground md:hidden [li:nth-child(even)_&]:top-5">
            Raro
          </span>
        )}
        {soldOut && (
          <span className="absolute left-1 top-1 z-10 rounded-sm bg-secondary px-2 py-0.5 text-[11px] font-bold uppercase text-foreground">Esgotado</span>
        )}
        {/* Favoritar: some no layout do Figma; aparece ao passar o mouse, no foco ou quando já está favoritado. */}
        {/* No mobile (sem hover) fica sempre visível, como no primeiro card do Figma. */}
        <div className="absolute right-[9px] top-3 z-10 opacity-0 max-md:[li:nth-child(even)_&]:top-5 transition-opacity focus-within:opacity-100 group-hover:opacity-100 has-[[aria-pressed=true]]:opacity-100 max-md:opacity-100 md:right-3">
          <FavoriteButton nftId={nft.id} nftName={nft.name} size="sm" className="max-md:size-7 max-md:bg-[#2a1a12] max-md:text-highlight" />
        </div>
        <img
          src={nft.image}
          alt={`Arte do NFT ${nft.name}`}
          width={250}
          height={250}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding="async"
          className={cn(
            'aspect-square w-full rounded-xl object-cover transition-transform max-md:rounded-[14px] duration-300 group-hover:scale-[1.02]',
            detail && 'xl:rounded-[13px]',
            cart && 'xl:size-[212px] xl:rounded-[17px] min-[1441px]:h-auto! min-[1441px]:w-[96.7%]!',
            soldOut && 'opacity-60',
          )}
        />
      </div>
      {/* Nome: 15px com altura automática (20); preço: 16px bold, lh 16. Espaços: 12/0 no detalhe, 8/8 no carrinho. */}
      <h3 className={cn('mt-[10px] truncate text-[15px] leading-[18px] max-md:px-2 md:mt-2 md:text-base md:leading-6', (detail || cart) && 'xl:text-[15px] xl:leading-5', detail && 'xl:mt-3')}>
        {/* O link cobre o card inteiro (área de clique grande), mantendo um único item focável. */}
        <Link to="/nft/$nftId" params={{ nftId: nft.id }} className="outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring">
          {nft.name}
        </Link>
      </h3>
      <p className={cn('text-[16px] font-bold leading-[18px] text-highlight max-md:px-2 md:mt-1 md:text-lg md:leading-6', (detail || cart) && 'xl:text-[16px] xl:leading-4', detail && 'xl:mt-0', cart && 'xl:mt-2')}>
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
      <div className="bg-card px-1 pb-5 pt-3 max-md:rounded-[18px] md:py-[25px]">
        <Skeleton className="aspect-square w-full rounded-xl" />
      </div>
      <Skeleton className="mt-2 h-6 w-3/4" />
      <Skeleton className="mt-1 h-6 w-1/3" />
    </div>
  )
}
