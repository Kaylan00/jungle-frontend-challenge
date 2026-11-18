/**
 * Aba "Cupons" do painel: criar (código, percentual ou valor fixo em ETH, validade opcional), listar e
 * desativar. A validação roda no navegador com o mesmo schema da API; a API confere de novo (código repetido
 * → 409 no campo, data no passado → 422 no campo). O carrinho e o pagamento usam os mesmos cupons do banco.
 */
import { zodResolver } from '@hookform/resolvers/zod'
import type { UseQueryResult } from '@tanstack/react-query'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { CouponForm, type AdminCoupon } from '@/api/contracts'
import { ApiError } from '@/api/http'
import { EmptyState, ErrorState } from '@/components/shared/error-state'
import { applyApiFieldErrors, FormField } from '@/components/shared/form-field'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { primaryButton } from '@/features/profile/profile-page'
import { formatEth } from '@/lib/eth'
import { cn } from '@/lib/utils'
import { useCreateCoupon, useDeactivateCoupon } from './hooks'

const STATUS: Record<AdminCoupon['status'], { label: string; className: string }> = {
  active: { label: 'Ativo', className: 'border-success/40 bg-success/10 text-success' },
  expired: { label: 'Expirado', className: 'border-warning/40 bg-warning/10 text-warning' },
  inactive: { label: 'Desativado', className: 'border-border bg-secondary text-muted-foreground' },
}

const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

const discountLabel = (c: Pick<AdminCoupon, 'kind' | 'value'>) => (c.kind === 'percent' ? `${c.value}%` : formatEth(c.value, { maxDecimals: 18 }))

/** Fim do dia escolhido, no fuso de quem está usando o painel. */
function endOfDayIso(date: string) {
  return new Date(`${date}T23:59:59.999`).toISOString()
}

export function AdminCoupons({ query }: { query: UseQueryResult<{ items: AdminCoupon[] }> }) {
  const [deactivating, setDeactivating] = useState<AdminCoupon | null>(null)
  return (
    <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start lg:gap-8">
      <CreateCouponForm />
      <section aria-labelledby="coupons-title" className="min-w-0">
        <h2 id="coupons-title" className="mb-3 text-[17px] font-bold leading-6">
          Cupons cadastrados
        </h2>
        {query.isPending ? (
          <ul className="flex flex-col gap-2" aria-busy="true" aria-label="Carregando cupons">
            {Array.from({ length: 3 }, (_, i) => (
              <li key={i} className="flex items-center gap-4 rounded-lg border border-border bg-card p-4" aria-hidden="true">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="ml-auto h-8 w-24" />
              </li>
            ))}
          </ul>
        ) : query.isError ? (
          <ErrorState
            title="Não foi possível carregar os cupons"
            message={query.error instanceof ApiError ? query.error.message : undefined}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        ) : query.data.items.length === 0 ? (
          <EmptyState title="Nenhum cupom cadastrado" message="Crie o primeiro no formulário ao lado." />
        ) : (
          <ul className="flex flex-col gap-2" data-testid="coupon-list">
            {query.data.items.map((c) => (
              <li key={c.code} className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-border bg-card px-4 py-3" data-testid="admin-coupon" data-code={c.code}>
                <div className="min-w-0 flex-1">
                  <p className="font-bold tracking-[0.04em]">{c.code}</p>
                  <p className="truncate text-[13px] text-muted-foreground">{c.description}</p>
                </div>
                <dl className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] leading-5">
                  <div>
                    <dt className="text-muted-foreground">Desconto</dt>
                    <dd className="font-semibold text-highlight">{discountLabel(c)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Validade</dt>
                    <dd>{c.expiresAt ? dateFmt.format(new Date(c.expiresAt)) : 'Sem validade'}</dd>
                  </div>
                  <div>
                    <dt className="sr-only">Status</dt>
                    <dd>
                      <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[12px] font-semibold leading-4', STATUS[c.status].className)}>{STATUS[c.status].label}</span>
                    </dd>
                  </div>
                </dl>
                {c.active && (
                  <Button variant="outline" size="sm" onClick={() => setDeactivating(c)}>
                    Desativar<span className="sr-only"> cupom {c.code}</span>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <Dialog open={Boolean(deactivating)} onOpenChange={(open) => !open && setDeactivating(null)}>
        {deactivating && <DeactivateDialog coupon={deactivating} onDone={() => setDeactivating(null)} />}
      </Dialog>
    </div>
  )
}

function DeactivateDialog({ coupon, onDone }: { coupon: AdminCoupon; onDone: () => void }) {
  const deactivate = useDeactivateCoupon()
  return (
    <DialogContent className="border-border bg-card sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Desativar o cupom {coupon.code}?</DialogTitle>
        <DialogDescription>
          Ele deixa de valer na hora: carrinhos com {coupon.code} perdem o desconto e uma revisão de compra aberta com ele vai pedir nova confirmação. Não dá para reativar.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={deactivate.isPending}>
          Cancelar
        </Button>
        <Button variant="destructive" onClick={() => deactivate.mutate(coupon.code, { onSuccess: onDone })} disabled={deactivate.isPending} data-testid="confirm-deactivate">
          {deactivate.isPending ? 'Desativando…' : 'Desativar cupom'}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

const couponFields = ['code', 'kind', 'value', 'expiresOn'] as const

function CreateCouponForm() {
  const create = useCreateCoupon()
  const [formError, setFormError] = useState<string | null>(null)
  const { register, handleSubmit, control, reset, setError, formState } = useForm<CouponForm>({
    resolver: zodResolver(CouponForm),
    defaultValues: { code: '', kind: 'percent', value: '', expiresOn: '' },
  })
  const kind = useWatch({ control, name: 'kind' })

  const submit = handleSubmit((values) => {
    setFormError(null)
    create.mutate(
      { code: values.code, kind: values.kind, value: values.value, expiresAt: values.expiresOn ? endOfDayIso(values.expiresOn) : null },
      {
        onSuccess: () => reset(),
        onError: (error) => {
          if (error instanceof ApiError) {
            // A API chama a validade de expiresAt; no formulário ela é a data (expiresOn).
            const fields = { ...error.fields, ...(error.fields.expiresAt ? { expiresOn: error.fields.expiresAt } : {}) }
            if (applyApiFieldErrors(fields, setError, couponFields)) return
          }
          setFormError(error instanceof ApiError ? error.message : 'Não foi possível criar o cupom. Tente novamente.')
        },
      },
    )
  })

  return (
    <section aria-labelledby="new-coupon-title" className="rounded-lg border border-border bg-card p-5">
      <h2 id="new-coupon-title" className="text-[17px] font-bold leading-6">
        Novo cupom
      </h2>
      <p className="mt-1 text-[13px] leading-5 text-muted-foreground">Vale no carrinho e no pagamento assim que for criado.</p>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-4" noValidate>
        <FormField
          label="Código"
          required
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="EX.: VERAO15"
          className="uppercase"
          hint="3 a 20 letras, números ou hífen"
          error={formState.errors.code?.message}
          {...register('code')}
        />
        <fieldset>
          <legend className="mb-2 text-[14px] leading-4">Tipo de desconto</legend>
          <Controller
            control={control}
            name="kind"
            render={({ field }) => (
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['percent', 'Percentual'],
                    ['fixed', 'Valor fixo (ETH)'],
                  ] as const
                ).map(([value, text]) => (
                  <label
                    key={value}
                    className={cn(
                      'flex h-10 cursor-pointer items-center justify-center rounded-[2px] border px-2 text-[13px] font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                      field.value === value ? 'border-primary bg-primary/10 text-highlight' : 'border-[#3f2319] hover:border-primary/60',
                    )}
                  >
                    <input type="radio" name={field.name} value={value} checked={field.value === value} onChange={() => field.onChange(value)} onBlur={field.onBlur} className="sr-only" />
                    {text}
                  </label>
                ))}
              </div>
            )}
          />
        </fieldset>
        <FormField
          label={kind === 'percent' ? 'Desconto (%)' : 'Desconto (ETH)'}
          required
          inputMode="decimal"
          autoComplete="off"
          placeholder={kind === 'percent' ? 'Ex.: 15' : 'Ex.: 0.05'}
          hint={kind === 'percent' ? 'De 0.01 a 100' : 'Nunca passa do subtotal do carrinho'}
          error={formState.errors.value?.message}
          {...register('value')}
        />
        <FormField label="Validade (opcional)" type="date" hint="Vale até o fim do dia escolhido. Em branco: sem validade." error={formState.errors.expiresOn?.message} {...register('expiresOn')} />
        {formError && (
          <p role="alert" className="text-[13px] text-destructive">
            ⚠ {formError}
          </p>
        )}
        <Button type="submit" className={cn(primaryButton, 'w-full self-stretch')} disabled={create.isPending}>
          {create.isPending ? 'Criando…' : 'Criar cupom'}
        </Button>
      </form>
    </section>
  )
}
