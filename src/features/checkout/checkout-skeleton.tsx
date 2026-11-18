import { RequiredMark } from '@/components/shared/form-field'
import { Skeleton } from '@/components/ui/skeleton'
import { SummaryLines } from '@/features/cart/cart-summary'
import { useBottomBar } from '@/lib/bottom-bars'
import { cn } from '@/lib/utils'
import { CHECKOUT_GRID, SUBMIT_BAR } from './checkout-model'

/** Barra de texto dentro de uma caixa com a altura da linha final. */
function Line({ className, bar }: { className?: string; bar?: string }) {
  return (
    <div className={cn('flex items-center', className)}>
      <Skeleton className={cn('h-[65%] w-full rounded-sm', bar)} />
    </div>
  )
}

/** Campo em carregamento: o rótulo (fixo) aparece e o campo vira um bloco de 40px com shimmer. */
function FieldSkeleton({ label, required = true, className }: { label: string; required?: boolean; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <p className="text-[14px] leading-4 text-foreground">
        {label}
        {required && <RequiredMark />}
      </p>
      <Skeleton className="h-10 w-full rounded-[2px]" />
    </div>
  )
}

/**
 * Pagamento em carregamento: a mesma grade, a mesma ordem (no celular a carteira vem antes do perfil)
 * e as mesmas alturas do formulário carregado. Rótulos e títulos são fixos e aparecem; o que depende
 * dos dados (campos, carteiras, itens, valores) vira skeleton. Mostra 2 carteiras e 1 item.
 */
export function CheckoutSkeleton() {
  const submitBarRef = useBottomBar()
  return (
    <div className={CHECKOUT_GRID} aria-busy="true" aria-label="Carregando pagamento" data-testid="checkout-loading">
      <p className="sr-only">Carregando pagamento…</p>
      <div className="max-lg:order-2 lg:row-span-2" aria-hidden="true">
        <p className="mb-3 text-[15px] font-semibold lg:mb-[13px] lg:text-[17px] lg:font-bold lg:leading-6">Perfil do colecionador</p>
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:gap-x-[23px] lg:gap-y-[17px] wide:gap-x-[calc(23*var(--u))]">
          <FieldSkeleton label="Nome de exibição" />
          <FieldSkeleton label="Nome de usuário" />
          <div className="flex flex-col gap-1.5 lg:gap-2">
            <p className="text-[13px] font-medium lg:text-[14px] lg:font-normal lg:leading-4">
              Rede
              <RequiredMark className="max-lg:hidden" />
              <span className="ml-0.5 text-primary lg:hidden">*</span>
            </p>
            <Skeleton className="h-10 w-full rounded-md lg:rounded-[2px]" />
          </div>
          <FieldSkeleton label="Nome do perfil" />
          <FieldSkeleton label="Endereço da carteira" />
          <FieldSkeleton label="ENS ou carteira secundária (opcional)" required={false} className="lg:pt-6 lg:[&>p]:hidden" />
          <FieldSkeleton label="Carteira" className="max-lg:hidden" />
          <FieldSkeleton label="Código de indicação" />
          <FieldSkeleton label="E-mail" />
          <FieldSkeleton label="Nome ENS" />
        </div>
        <div className="mt-4 flex flex-col gap-1.5 lg:mt-6 lg:gap-2">
          <p className="text-[13px] font-medium lg:text-[14px] lg:font-normal lg:leading-4">Observação do colecionador (opcional)</p>
          <Skeleton className="h-16 w-full max-w-md rounded-md lg:h-[152px] lg:w-[350px] lg:max-w-none lg:rounded-[2px] wide:w-[calc(350*var(--u))]" />
        </div>
      </div>

      <div className="space-y-5 max-lg:order-1 max-md:flex max-md:flex-col max-md:gap-5 max-md:space-y-0 lg:space-y-0" aria-hidden="true">
        <div className="max-md:order-3">
          <div className="mb-2 flex justify-between text-[14px] font-semibold lg:mb-3 lg:block lg:border-b lg:border-[#442c1b] lg:pb-2 lg:font-normal">
            <p className="lg:text-[17px] lg:font-bold lg:leading-6">Seus NFTs</p>
            <p className="lg:mt-[3px] lg:flex lg:justify-between lg:text-[16px] lg:leading-6">
              <span className="hidden lg:inline">NFTs</span>
              <span>Subtotal</span>
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-md bg-card p-1.5 text-[13px] lg:h-[70px] lg:rounded-none lg:bg-[#241612] lg:py-0 lg:pl-1 lg:pr-3 wide:h-[calc(70*var(--u))]">
            <Skeleton className="size-10 shrink-0 rounded-sm lg:size-[70px] lg:rounded-[4px] wide:size-[calc(70*var(--u))]" />
            <div className="min-w-0 flex-1 lg:ml-[1px]">
              <Line className="h-[19.5px] lg:h-[22px]" bar="w-[140px]" />
              <Line className="h-[16.5px] lg:h-5" bar="w-[90px]" />
            </div>
            <Line className="h-[19.5px] w-24 lg:w-[100px]" bar="ml-auto w-[72px]" />
          </div>
        </div>

        <p className="w-full text-center text-[13px] max-md:order-4 lg:!mt-[7px] lg:text-[14px] lg:leading-6">
          Tem um código promocional? <span className="text-primary lg:text-inherit">Aplique aqui</span>
        </p>

        <SummaryLines summary={null} coupon={null} variant="checkout" className="max-md:order-5 lg:!mt-[7px]" />
        <p className="-mt-2 text-[11px] text-muted-foreground max-md:order-6 max-md:-mt-3 lg:sr-only">A taxa de rede final depende da rede escolhida e é confirmada na revisão.</p>

        <div className="max-md:order-1 lg:!mt-[2px]">
          <p className="mb-2 text-center text-[15px] font-semibold max-md:sr-only lg:mb-[17px] lg:w-full lg:text-[17px] lg:font-bold lg:leading-6">Carteira e rede</p>
          <div className="mb-[13px] flex items-baseline justify-between md:hidden">
            <p className="text-[16px] font-bold leading-6">Carteira conectada</p>
            <span className="text-[14px] font-bold text-highlight">Trocar carteira</span>
          </div>
          <div className="space-y-2 max-md:space-y-5 lg:hidden">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-md border border-border bg-card p-3 text-[13px] max-md:min-h-[92px] max-md:gap-5 max-md:rounded-[12px] max-md:border-0 max-md:py-2.5 max-md:pl-[19px] max-md:pr-3 lg:min-h-[45px] lg:gap-[11px] lg:rounded-[2px] lg:border-[#3f2319] lg:bg-transparent lg:py-[5px] lg:text-[15px]"
              >
                <Skeleton className="size-4 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1">
                  <Line className="h-[19.5px] max-md:h-6 lg:h-[18px]" bar="w-[90px]" />
                  <Line className="h-[18px] max-md:hidden lg:h-[14px]" bar="w-[220px]" />
                  <Line className="mt-[3px] h-[22px] md:hidden" bar="w-[120px]" />
                  <Line className="h-[22px] md:hidden" bar="w-[110px]" />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[16px] font-bold leading-6 md:hidden">Carteira e rede</p>
          <div className="mt-3 space-y-2 max-md:mt-[13px] max-md:space-y-4 lg:mt-0 lg:space-y-4">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-xl bg-card p-3 text-[13px] max-md:h-[65px] max-md:gap-[11px] max-md:py-0 max-md:pl-[14px] max-md:pr-4 lg:h-[45px] lg:gap-[11px] lg:rounded-[2px] lg:border lg:border-[#3f2319] lg:bg-transparent lg:px-[11px] lg:py-0"
              >
                <Skeleton className="size-4 shrink-0 rounded-full max-lg:order-last" />
                <Skeleton className="size-8 shrink-0 rounded-full max-md:size-10 lg:size-[26px]" />
                <Line className="h-[19.5px] flex-1 max-md:h-[21px] lg:h-[18px]" bar="w-[130px]" />
              </div>
            ))}
          </div>
          <p className="mt-[13px] flex items-baseline justify-end gap-8 text-[16px] font-bold leading-6 md:hidden">
            Total:
            <span className="text-[18px]">
              <Skeleton className="inline-block h-[0.72em] w-[96px] rounded-sm align-baseline" />
            </span>
          </p>
          <div className="mt-3 space-y-2 rounded-md border border-border p-3 text-[13px] max-md:mt-5 max-md:rounded-[12px] max-md:border-0 max-md:bg-card max-md:p-4 lg:mt-4 lg:rounded-[2px] lg:border-[#3f2319]">
            <Line className="h-[19.5px]" bar="w-[170px]" />
            <Skeleton className="h-9 w-full" />
          </div>
        </div>
      </div>

      <div
        ref={submitBarRef}
        className={SUBMIT_BAR}
        aria-hidden="true"
        data-motion-fixed
      >
        <Skeleton className="h-11 w-full max-lg:h-12 max-lg:rounded-full max-md:h-[60px] lg:h-[45px] lg:rounded-[4px]" />
      </div>
    </div>
  )
}
