/** Peças pequenas das seções do Kurio Admin: busca da seção, paginação, selos de status e "há quanto tempo". */
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import type { OrderStatus } from '@/api/contracts'
import { cn } from '@/lib/utils'
import { formatDateTime, ORDER_STATUS, timeAgo } from './ui-utils'

/** Campo de busca da seção. Quem usa decide o que fazer com o termo (normalmente, levá-lo à URL). */
export function SectionSearch({
  id,
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  /** Enquanto a casca confere o acesso (skeleton da seção), o campo aparece mas ainda não aceita digitação. */
  disabled?: boolean
}) {
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
        disabled={disabled}
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

/*
 * SKELETON do painel (classes em shell/panel.css). A regra: o skeleton usa a MESMA marcação do conteúdo final
 * (mesmas classes de tamanho, padding, line-height) e só troca o dado por um texto de exemplo coberto pela
 * barra. Assim a caixa é a mesma e nada pula quando o dado chega. Rótulos fixos (títulos, cabeçalhos de
 * tabela, nomes dos indicadores) continuam visíveis: só o que vem da API vira skeleton.
 */

/** Uma linha de texto ainda carregando (o exemplo define a largura; não quebra linha). */
export function Sk({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span aria-hidden="true" className={cn('kp-sk', className)}>
      {children}
    </span>
  )
}

/** Texto longo carregando: quebra como o texto final, uma faixa por linha. */
export function SkLines({ children }: { children: React.ReactNode }) {
  return (
    <span aria-hidden="true" className="kp-sk-linhas">
      {children}
    </span>
  )
}

/** Bloco com tamanho próprio (imagem, avatar, pílula, botão). */
export function SkBlock({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('kp-sk-bloco block', className)} />
}

/** Pílula de status carregando: mesma caixa da OrderStatusPill (o rótulo de exemplo define a largura). */
export function StatusPillSkeleton({ label = 'Confirmado' }: { label?: string }) {
  return (
    <span aria-hidden="true" className="kp-sk-bloco inline-flex items-center gap-1.5 rounded-full border border-transparent px-2.5 py-0.5 text-[12px] font-semibold leading-5 text-transparent select-none">
      <span className="size-1.5" />
      {label}
    </span>
  )
}

/** O aviso para leitor de tela (o container leva aria-busy). */
export function LoadingNote({ children }: { children: React.ReactNode }) {
  return (
    <span role="status" className="sr-only">
      {children}
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
