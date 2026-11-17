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
export function SummaryLines({ summary, coupon, className, variant = 'default' }: { summary: Summary; coupon: Coupon | null; className?: string; variant?: 'default' | 'cart' | 'checkout' }) {
  const figma = variant !== 'default'
  const row = cn('flex justify-between', figma && 'lg:items-baseline lg:leading-6')
  const big = figma && 'lg:text-[18px]'
  return (
    <dl className={cn('space-y-2.5 text-[14px]', figma && 'lg:space-y-2 lg:text-[15px]', variant === 'checkout' && 'lg:relative', className)} data-testid="cart-summary">
      <div className={row}>
        <dt>Subtotal</dt>
        <dd className={cn('tabular-nums', big)} data-testid="summary-subtotal">
          {formatEth(summary.subtotal)}
        </dd>
      </div>
      <div className={row}>
        <dt>{coupon ? `Desconto (${coupon.code})` : 'Desconto do lançamento'}</dt>
        <dd className="tabular-nums" data-testid="summary-discount">
          (-) {isZero(summary.discount) ? '0.00' : formatEth(summary.discount)}
        </dd>
      </div>
      <div className={row}>
        <dt>Taxa de rede</dt>
        <dd className={cn('text-right tabular-nums', big, variant === 'cart' && 'lg:relative')} data-testid="summary-fee">
          {formatEth(summary.networkFee)}
          <span
            className={cn(
              'block text-[11px] text-primary',
              variant === 'cart' && 'lg:absolute lg:right-0 lg:top-[34px] lg:whitespace-nowrap lg:text-[12px] lg:leading-4',
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
          variant === 'cart' && 'lg:!mt-[44px] lg:border-t-0 lg:pt-0',
          variant === 'checkout' && 'lg:!mt-[35px] lg:border-[#442c1b] lg:px-[42px] lg:pt-[6px]',
          figma && 'lg:items-baseline lg:leading-6',
        )}
      >
        <dt className={cn(figma && 'lg:text-[16px]')}>Total</dt>
        <dd className={cn('text-lg text-primary tabular-nums', figma && 'lg:text-[18px] lg:text-[#e89b55]')} data-testid="summary-total">
          {formatEth(summary.total)}
        </dd>
      </div>
    </dl>
  )
}

export function SummarySkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true" data-testid="summary-loading">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="flex justify-between">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-5 w-20" />
        </div>
      ))}
      <div className="flex justify-between border-t border-border pt-3">
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-6 w-24" />
      </div>
    </div>
  )
}

export function CouponForm({ cart, compact }: { cart: Cart; compact?: boolean }) {
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
      <label htmlFor="coupon" className={cn('mb-2 block text-[13px] font-semibold max-lg:sr-only', compact ? 'sr-only' : 'lg:mb-[5px] lg:text-[14px] lg:font-bold lg:leading-5 lg:tracking-[0.4px]')}>
        Código promocional
      </label>
      <div className={cn('flex overflow-hidden border border-input max-lg:rounded-full', compact ? 'rounded-full' : 'rounded-md lg:h-10 lg:rounded-[3px] lg:border-[#d28a4c]')}>
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
            'h-10 min-w-0 flex-1 bg-transparent px-3 text-[13px] uppercase placeholder:normal-case placeholder:text-subtle-foreground',
            !compact && 'lg:h-[38px] lg:pl-[8px] lg:text-[12px] lg:tracking-[0.15px] lg:placeholder:text-[#b39463]',
          )}
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={apply.isPending || !code.trim()}
          className={cn(
            'bg-primary px-4 text-[13px] font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60 max-lg:rounded-full',
            compact ? 'rounded-full' : 'lg:w-[102px] lg:px-0 lg:text-[14px] lg:font-bold lg:disabled:opacity-100',
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
