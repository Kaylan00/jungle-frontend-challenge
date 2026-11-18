import { X } from 'lucide-react'
import { useState } from 'react'
import type { Cart, CartSummary as Summary, Coupon } from '@/api/contracts'
import { ApiError } from '@/api/http'
import { Skeleton } from '@/components/ui/skeleton'
import { isZero, formatEth } from '@/lib/eth'
import { cn } from '@/lib/utils'
import { useApplyCoupon, useRemoveCoupon } from './hooks'

/**
 * Linhas de valores: tudo vem calculado da API (o front só formata).
 * variant: "cart" e "checkout" seguem o Figma no desktop (lg); "default" é o compacto (revisão, mobile).
 */
/** Valor em carregamento: barra inline (a linha mantém a altura do texto final). */
function ValueSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn('inline-block h-[0.72em] w-[72px] rounded-sm align-baseline', className)} />
}

/**
 * summary = null: carregando. Os rótulos (fixos) aparecem e só os valores viram barras com shimmer,
 * então o bloco tem exatamente a mesma altura do resumo carregado.
 */
export function SummaryLines({ summary, coupon, className, variant = 'default' }: { summary: Summary | null; coupon: Coupon | null; className?: string; variant?: 'default' | 'cart' | 'checkout' }) {
  const figma = variant !== 'default'
  const loading = summary === null
  // Carrinho no mobile (Figma 414): linhas de 15px a cada 32px, total sem divisória.
  const cartMobile = variant === 'cart' && 'max-md:space-y-2 max-md:text-[15px] max-md:leading-6'
  // Carrinho no desktop (Figma, Fees): linhas de 15px com altura automática (20) a cada 12px, alinhadas no topo;
  // valores de 18px com lh 16.
  const cartLg = variant === 'cart'
  const row = cn('flex justify-between', figma && 'lg:items-baseline lg:leading-6', cartLg && 'lg:items-start lg:leading-5')
  const big = cn(figma && 'lg:text-[18px]', cartLg && 'lg:leading-4')
  return (
    <dl
      className={cn('space-y-2.5 text-[14px]', cartMobile, figma && 'lg:space-y-2 lg:text-[15px]', cartLg && 'lg:space-y-3', variant === 'checkout' && 'lg:relative', className)}
      data-testid={loading ? 'summary-loading' : 'cart-summary'}
      aria-hidden={loading || undefined}
    >
      <div className={row}>
        <dt>Subtotal</dt>
        <dd className={cn('tabular-nums', big)} data-testid={loading ? undefined : 'summary-subtotal'}>
          {loading ? <ValueSkeleton /> : formatEth(summary.subtotal)}
        </dd>
      </div>
      <div className={row}>
        <dt>{coupon ? `Desconto (${coupon.code})` : 'Desconto do lançamento'}</dt>
        <dd className="tabular-nums" data-testid={loading ? undefined : 'summary-discount'}>
          {loading ? <ValueSkeleton className="w-[64px]" /> : <>(-) {isZero(summary.discount) ? '0.00' : formatEth(summary.discount)}</>}
        </dd>
      </div>
      <div className={row}>
        <dt>Taxa de rede</dt>
        <dd className={cn('text-right tabular-nums', big, variant === 'cart' && 'lg:relative')} data-testid={loading ? undefined : 'summary-fee'}>
          {loading ? <ValueSkeleton className="w-[80px]" /> : formatEth(summary.networkFee)}
          <span
            className={cn(
              'block text-[11px] text-primary',
              variant === 'cart' && 'max-md:text-[12px] max-md:leading-4',
              variant === 'cart' && 'lg:absolute lg:right-0 lg:top-8 lg:whitespace-nowrap lg:text-[12px] lg:leading-4 lg:text-highlight',
              variant === 'checkout' && 'lg:absolute lg:inset-x-0 lg:top-[98px] lg:text-center lg:text-[12px] lg:leading-4',
            )}
          >
            Taxa estimada
          </span>
        </dd>
      </div>
      <div
        className={cn(
          'flex justify-between border-t border-border pt-3 font-bold',
          variant === 'cart' && 'max-md:!mt-1 max-md:border-t-0 max-md:pt-0 lg:!mt-[52px] lg:border-t-0 lg:pt-0',
          variant === 'checkout' && 'lg:!mt-[35px] lg:border-[#442c1b] lg:px-[42px] lg:pt-[6px]',
          figma && 'lg:items-baseline lg:leading-6',
          cartLg && 'lg:items-start lg:leading-4',
        )}
      >
        <dt className={cn(figma && 'lg:text-[16px]', variant === 'cart' && 'max-md:text-[16px]')}>Total</dt>
        <dd className={cn('text-lg text-primary tabular-nums', variant === 'cart' && 'max-md:text-highlight', figma && 'lg:text-[18px] lg:text-[#e89b55]', cartLg && 'lg:leading-4')} data-testid={loading ? undefined : 'summary-total'}>
          {loading ? <ValueSkeleton className="w-[96px]" /> : formatEth(summary.total)}
        </dd>
      </div>
    </dl>
  )
}

/** Campo de cupom em carregamento, com a mesma caixa do CouponForm (variante do carrinho/pagamento). */
export function CouponSkeleton({ variant }: { variant?: 'cart' }) {
  const cartLg = variant === 'cart'
  return (
    <div aria-hidden="true">
      {/* Rótulo "Código promocional" (só no lg) */}
      <div className={cn('mb-2 hidden h-5 items-center lg:flex', cartLg ? 'lg:h-4' : 'lg:mb-[5px]')}>
        <Skeleton className="h-[70%] w-[130px] rounded-sm" />
      </div>
      <Skeleton className="h-[50px] w-full rounded-full md:h-[42px] lg:h-10 lg:rounded-[3px]" />
    </div>
  )
}

export function CouponForm({ cart, compact, variant }: { cart: Cart; compact?: boolean; variant?: 'cart' }) {
  // Carrinho no desktop (Figma, Promo Code): rótulo 14/16 bold, 8px até o campo; Aplicar 15/16 bold.
  const cartLg = variant === 'cart'
  const apply = useApplyCoupon()
  const remove = useRemoveCoupon()
  const [code, setCode] = useState('')
  const error = apply.error instanceof ApiError ? (apply.error.fields.code ?? apply.error.message) : null

  if (cart.coupon) {
    return (
      <div className="flex items-center justify-between rounded-md border border-primary/50 bg-primary/10 px-3 py-2 text-[13px]" data-testid="applied-coupon">
        <span>
          Cupom <strong>{cart.coupon.code}</strong> · {cart.coupon.description}
        </span>
        <button
          type="button"
          onClick={() => remove.mutate()}
          disabled={remove.isPending}
          className="grid size-7 place-items-center rounded hover:bg-secondary"
          aria-label={`Remover cupom ${cart.coupon.code}`}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!code.trim()) return
        apply.mutate(code.trim(), { onSuccess: () => setCode('') })
      }}
      noValidate
    >
      <label htmlFor="coupon" className={cn('mb-2 block text-[13px] font-semibold max-lg:sr-only', compact ? 'sr-only' : 'lg:mb-[5px] lg:text-[14px] lg:font-bold lg:leading-5 lg:tracking-[0.4px]', cartLg && 'lg:mb-2 lg:leading-4 lg:tracking-normal')}>
        Código promocional
      </label>
      <div
        className={cn(
          'flex overflow-hidden border border-input max-lg:rounded-full',
          compact ? 'rounded-full' : 'rounded-md max-md:h-[50px] max-md:border-0 max-md:shadow-[inset_0_0_0_1px_#3f2319] lg:h-10 lg:rounded-[3px] lg:border-[#d28a4c]',
        )}
      >
        <input
          id="coupon"
          value={code}
          onChange={(e) => {
            setCode(e.target.value)
            if (apply.isError) apply.reset()
          }}
          placeholder="Digite o código promocional..."
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'coupon-error' : undefined}
          className={cn(
            'h-10 min-w-0 flex-1 text-ellipsis bg-transparent px-3 text-[13px] uppercase placeholder:normal-case placeholder:text-subtle-foreground',
            !compact && 'max-md:h-[50px] max-md:pl-3 max-md:pr-1 max-md:text-[12px] max-md:placeholder:text-[#b39463] lg:h-[38px] lg:pl-[8px] lg:text-[12px] lg:tracking-[0.15px] lg:placeholder:text-[#b39463]',
            cartLg && 'lg:pr-0 lg:leading-4 lg:tracking-normal',
          )}
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={apply.isPending || !code.trim()}
          className={cn(
            'bg-primary px-4 text-[13px] font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60 max-lg:rounded-full',
            compact
              ? 'rounded-full'
              : 'max-md:w-[97px] max-md:bg-[linear-gradient(90deg,#855632,#965f35)] max-md:px-0 max-md:text-[15px] max-md:font-bold max-md:text-foreground max-md:shadow-[-2px_0_6px_rgba(0,0,0,0.25)] max-md:disabled:opacity-100 lg:w-[97px] lg:px-0 lg:text-[14px] lg:font-bold lg:disabled:opacity-100',
            cartLg && 'lg:text-[15px] lg:leading-4',
          )}
        >
          {apply.isPending ? 'Aplicando…' : 'Aplicar'}
        </button>
      </div>
      {error && (
        <p id="coupon-error" role="alert" className="mt-1.5 text-[12px] text-destructive" data-testid="coupon-error">
          {error}
        </p>
      )}
    </form>
  )
}
