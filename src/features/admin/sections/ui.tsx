/** Peças pequenas das seções do Kurio Admin: busca da seção, paginação, selos de status e "há quanto tempo". */
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import type { OrderStatus } from '@/api/contracts'
import { cn } from '@/lib/utils'
import { formatDateTime, ORDER_STATUS, timeAgo } from './ui-utils'

/** Campo de busca da seção. Quem usa decide o que fazer com o termo (normalmente, levá-lo à URL). */
export function SectionSearch({ id, label, value, onChange, placeholder }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full sm:w-[340px]">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--kp-fumaca)]" aria-hidden="true" />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-[10px] border border-[var(--kp-linha-forte)] bg-[var(--kp-ficha)] pl-9 pr-3 text-[14px] placeholder:text-[var(--kp-fumaca)] focus-visible:border-[var(--kp-laranja)] focus-visible:outline-none"
      />
    </div>
  )
}

export function Pager({ page, totalPages, label, onPage }: { page: number; totalPages: number; label: string; onPage: (page: number) => void }) {
  if (totalPages <= 1) return null
  const btn =
    'inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-[var(--kp-linha-forte)] px-3 text-[13px] font-semibold transition-colors hover:border-[var(--kp-laranja)] disabled:pointer-events-none disabled:opacity-40'
  return (
    <nav aria-label={label} className="flex items-center justify-between gap-3">
      <button type="button" className={btn} onClick={() => onPage(page - 1)} disabled={page <= 1}>
        <ChevronLeft className="size-4" aria-hidden="true" />
        Anterior
      </button>
      <p className="text-[12.5px] text-[var(--kp-grafite)]" aria-current="page">
        Página {page} de {totalPages}
      </p>
      <button type="button" className={btn} onClick={() => onPage(page + 1)} disabled={page >= totalPages}>
        Próxima
        <ChevronRight className="size-4" aria-hidden="true" />
      </button>
    </nav>
  )
}

export function OrderStatusPill({ status }: { status: OrderStatus }) {
  const s = ORDER_STATUS[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-semibold leading-5', s.className)} data-testid="order-status" data-status={status}>
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', s.dot)} />
      {s.label}
    </span>
  )
}

export function TimeAgo({ iso, now }: { iso: string; now: number }) {
  return (
    <time dateTime={iso} title={formatDateTime(iso)}>
      {timeAgo(iso, now)}
    </time>
  )
}
