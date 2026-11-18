/**
 * PEDIDOS de todas as contas (GET /admin/orders, só admin).
 *
 * O status é ao vivo: cada pedido criado, confirmado ou recusado chega pelo socket (admin.activity) e a lista
 * é conferida de novo pela REST; enquanto houver pedido pendente na tela, ela também confere a cada 5 s (rede
 * de segurança se o socket cair). Linha cujo status mudou com a tela aberta pisca uma vez.
 * Filtro, busca e página ficam na URL. No celular a tabela vira fichas (mesma marcação, rótulos por célula).
 */
import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import type { AdminOrder } from '@/api/admin-contracts'
import type { OrderStatus } from '@/api/contracts'
import { ApiError } from '@/api/http'
import { EmptyState, ErrorState } from '@/components/shared/error-state'
import { Skeleton } from '@/components/ui/skeleton'
import { NETWORK_LABEL } from '@/features/catalog/search-params'
import { formatEth } from '@/lib/eth'
import { cn } from '@/lib/utils'
import { useAdminOrders } from '../hooks'
import { PanelPage } from '../shell/panel-page'
import { OrderStatusPill, Pager, SectionSearch, TimeAgo } from './ui'
import { useDebouncedSearch, useNow } from './ui-utils'

export interface OrdersSearch {
  status?: OrderStatus
  q?: string
  pagina?: number
}

const PAGE_SIZE = 10

const FILTERS: Array<{ status?: OrderStatus; label: string; count: 'all' | OrderStatus }> = [
  { label: 'Todos', count: 'all' },
  { status: 'pending', label: 'Processando', count: 'pending' },
  { status: 'confirmed', label: 'Confirmados', count: 'confirmed' },
  { status: 'rejected', label: 'Recusados', count: 'rejected' },
]

const cell = 'px-4 py-3 align-middle max-md:flex max-md:items-baseline max-md:justify-between max-md:gap-4 max-md:px-0 max-md:py-1 max-md:before:shrink-0 max-md:before:text-[12px] max-md:before:text-[var(--kp-fumaca)] max-md:before:content-[attr(data-label)]'

export function OrdersSection({ search }: { search: OrdersSearch }) {
  const navigate = useNavigate()
  const orders = useAdminOrders({ status: search.status, q: search.q || undefined, page: search.pagina, pageSize: PAGE_SIZE })
  const now = useNow()
  const [term, setTerm] = useDebouncedSearch(search.q, (q) => void navigate({ to: '/admin/pedidos', search: (prev) => ({ status: prev.status, q }), replace: true, resetScroll: false }))

  // Status de cada pedido na leitura anterior: o que mudou com a tela aberta ganha o brilho de "mudou agora".
  const lastStatus = useRef(new Map<string, OrderStatus>())
  const [changed, setChanged] = useState<ReadonlySet<string>>(() => new Set())
  useEffect(() => {
    if (!orders.data) return
    const next = new Set<string>()
    for (const o of orders.data.items) {
      const before = lastStatus.current.get(o.id)
      if (before && before !== o.status) next.add(o.id)
      lastStatus.current.set(o.id, o.status)
    }
    if (next.size === 0) return
    // Sincroniza com a resposta que acabou de chegar da API (sistema externo), e some sozinho.
    // oxlint-disable-next-line react/set-state-in-effect
    setChanged(next)
    const t = setTimeout(() => setChanged(new Set()), 1800)
    return () => clearTimeout(t)
  }, [orders.data])

  const counts = orders.data?.counts

  return (
    <PanelPage eyebrow="Vendas" title="Pedidos" description="Pedidos de todas as contas, do mais recente ao mais antigo. O status muda aqui sozinho quando o pagamento é confirmado ou recusado.">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <nav aria-label="Filtrar pedidos por status">
          {/* No celular os quatro filtros ficam numa grade 2×2 (nada escondido numa rolagem lateral). */}
          <ul className="grid grid-cols-2 gap-1 rounded-[12px] border border-[var(--kp-linha)] bg-[var(--kp-ficha)] p-1 sm:flex sm:w-max">
            {FILTERS.map((f) => {
              const current = search.status === f.status
              return (
                <li key={f.label}>
                  <Link
                    to="/admin/pedidos"
                    search={{ status: f.status, q: search.q }}
                    replace
                    resetScroll={false}
                    aria-current={current ? 'page' : undefined}
                    className={cn(
                      'flex h-9 items-center justify-between gap-2 rounded-[9px] px-3 text-[13px] font-semibold transition-colors sm:h-8 sm:justify-start',
                      current ? 'bg-[var(--kp-laranja)] text-[#140d0a]' : 'text-[var(--kp-grafite)] hover:text-[var(--kp-tinta)]',
                    )}
                  >
                    {f.label}
                    {counts && <span className={cn('tabular-nums', current ? 'text-[#140d0a]/70' : 'text-[var(--kp-fumaca)]')}>{counts[f.count]}</span>}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
        <SectionSearch id="orders-search" label="Buscar pedido" value={term} onChange={setTerm} placeholder="Número (JG-00001) ou cliente" />
      </div>

      {!orders.data && !orders.isError ? (
        <div className="kp-ficha flex flex-col gap-4 p-5" aria-busy="true" aria-label="Carregando pedidos">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-center gap-4" aria-hidden="true">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="hidden h-4 w-24 md:block" />
              <Skeleton className="h-6 w-28 rounded-full" />
            </div>
          ))}
        </div>
      ) : !orders.data ? (
        <ErrorState
          title="Não foi possível carregar os pedidos"
          message={orders.error instanceof ApiError ? orders.error.message : undefined}
          onRetry={() => void orders.refetch()}
          retrying={orders.isFetching}
        />
      ) : orders.data.items.length === 0 ? (
        <EmptyState
          className="kp-ficha"
          title={search.q || search.status ? 'Nenhum pedido com esse filtro' : 'Nenhum pedido ainda'}
          message={search.q || search.status ? 'Tente outro status ou limpe a busca.' : 'Quando alguém comprar na loja, o pedido aparece aqui com o status ao vivo.'}
          action={
            (search.q || search.status) && (
              <Link to="/admin/pedidos" className="text-[13px] font-semibold text-[var(--kp-laranja-texto)] hover:underline">
                Ver todos os pedidos
              </Link>
            )
          }
        />
      ) : (
        <>
          <div className={cn('kp-ficha overflow-hidden transition-opacity', orders.isPlaceholderData && 'opacity-60')} aria-busy={orders.isPlaceholderData || undefined}>
            <table className="w-full border-collapse text-left text-[13.5px] max-md:block">
              <caption className="sr-only">Pedidos{search.status ? ` (${FILTERS.find((f) => f.status === search.status)?.label})` : ''}</caption>
              <thead className="border-b border-[var(--kp-linha)] text-[11px] uppercase tracking-[0.12em] text-[var(--kp-fumaca)] max-md:sr-only">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Pedido</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Cliente</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Itens</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Total</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Quando</th>
                </tr>
              </thead>
              <tbody className="max-md:block" data-testid="admin-order-list">
                {orders.data.items.map((o) => (
                  <OrderRow key={o.id} order={o} now={now} changed={changed.has(o.id)} />
                ))}
              </tbody>
            </table>
          </div>
          <Pager
            page={orders.data.page}
            totalPages={orders.data.totalPages}
            label="Páginas da lista de pedidos"
            onPage={(p) => void navigate({ to: '/admin/pedidos', search: (prev) => ({ ...prev, pagina: p > 1 ? p : undefined }), resetScroll: false })}
          />
        </>
      )}
    </PanelPage>
  )
}

function OrderRow({ order: o, now, changed }: { order: AdminOrder; now: number; changed: boolean }) {
  const items = o.lines.reduce((s, l) => s + l.quantity, 0)
  const first = o.lines[0]
  return (
    <tr
      className={cn('border-b border-[var(--kp-linha)] last:border-b-0 max-md:block max-md:px-4 max-md:py-3', changed && 'kp-chegou')}
      data-testid="admin-order"
      data-order-number={o.number}
    >
      <th scope="row" data-label="Pedido" className={cn(cell, 'font-bold tabular-nums')}>
        <span>
          {o.number}
          <span className="block text-[11.5px] font-normal text-[var(--kp-fumaca)] max-md:hidden">{NETWORK_LABEL[o.network]}</span>
        </span>
      </th>
      <td data-label="Cliente" className={cell}>
        <span className="min-w-0 max-md:text-right">
          <span className="block truncate font-semibold">{o.customer.name}</span>
          <span className="block truncate text-[12px] text-[var(--kp-fumaca)]">@{o.customer.username}</span>
        </span>
      </td>
      <td data-label="Itens" className={cell} title={o.lines.map((l) => `${l.name} · edição ${l.editionName} ×${l.quantity}`).join('\n')}>
        <span className="min-w-0 max-md:text-right">
          <span className="block max-w-[260px] truncate">
            {first ? `${first.name} · ${first.editionName}` : '—'}
            {o.lines.length > 1 && <span className="text-[var(--kp-fumaca)]"> +{o.lines.length - 1}</span>}
          </span>
          <span className="block text-[12px] text-[var(--kp-fumaca)]">
            {items} {items === 1 ? 'unidade' : 'unidades'}
            {o.couponCode && ` · cupom ${o.couponCode}`}
          </span>
        </span>
      </td>
      <td data-label="Total" className={cn(cell, 'whitespace-nowrap text-right font-bold tabular-nums text-[var(--kp-laranja-texto)]')}>
        {formatEth(o.total, { maxDecimals: 6 })}
      </td>
      <td data-label="Status" className={cell}>
        <span className="flex flex-col items-start gap-1 max-md:items-end">
          <OrderStatusPill status={o.status} />
          {o.failureReason && <span className="max-w-[220px] text-[11.5px] leading-4 text-[var(--kp-fumaca)] max-md:text-right">{o.failureReason}</span>}
        </span>
      </td>
      <td data-label="Quando" className={cn(cell, 'whitespace-nowrap text-right text-[12.5px] text-[var(--kp-grafite)]')}>
        <TimeAgo iso={o.createdAt} now={now} />
      </td>
    </tr>
  )
}
