/**
 * Peças de skeleton das vitrines de NFTs (detalhe e carrinho). Ficam num módulo próprio para a rota
 * do carrinho não carregar o código da página de detalhe só por causa delas.
 */
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * Linha de texto em carregamento: a caixa tem a altura da linha do texto final (className) e a barra
 * com shimmer ocupa parte dela, então trocar o skeleton pelo texto não move nada.
 */
export function SkeletonLine({ className, bar }: { className?: string; bar?: string }) {
  return (
    <div className={cn('flex items-center', className)}>
      <Skeleton className={cn('h-[65%] w-full rounded-sm', bar)} />
    </div>
  )
}

/**
 * Card das vitrines ("Mais desta coleção" e "Colecionadores também viram") em carregamento:
 * mesmas caixas, respiros e alturas de linha do NftCard em cada variante.
 */
export function VitrineCardSkeleton({ variant }: { variant: 'detail' | 'cart' }) {
  const detail = variant === 'detail'
  const cart = variant === 'cart'
  return (
    <div aria-hidden="true">
      <div
        className={cn(
          'bg-card px-1 pb-5 pt-3 max-md:rounded-[18px] max-md:bg-[#271813] max-md:[li:nth-child(even)_&]:pb-3 max-md:[li:nth-child(even)_&]:pt-5 md:py-[25px]',
          'xl:flex xl:aspect-[219/255] xl:items-center xl:justify-center xl:p-0',
          detail && 'xl:pb-[3px] wide:pb-[calc(3*var(--u))]',
        )}
      >
        <Skeleton className={cn('aspect-square w-full rounded-xl max-md:rounded-[14px] xl:w-[96.8%]', detail && 'xl:rounded-[13px]', cart && 'xl:rounded-[17px]')} />
      </div>
      <SkeletonLine className={cn('mt-[10px] h-[18px] max-md:px-2 md:mt-2 md:h-6 xl:h-5', detail && 'xl:mt-3')} bar="w-3/4" />
      <SkeletonLine className={cn('h-[18px] max-md:px-2 md:mt-1 md:h-6 xl:h-4', detail && 'xl:mt-0', cart && 'xl:mt-2')} bar="w-2/5" />
    </div>
  )
}

/** Pontos de paginação de uma vitrine em carregamento. */
export function VitrineDotsSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex justify-center gap-2', className)} aria-hidden="true">
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} className="size-3 rounded-full" />
      ))}
    </div>
  )
}

