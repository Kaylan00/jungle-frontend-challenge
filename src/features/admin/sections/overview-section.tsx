/**
 * VISÃO GERAL: a primeira tela do Kurio Admin.
 *
 * Responde de relance "a loja está vendendo?" com números da API (GET /admin/overview), e "o que acabou de
 * acontecer?" com o feed de atividade (GET /admin/activity + evento admin.activity pelo socket). Nada aqui é
 * calculado ou inventado no componente: cada número vem pronto do servidor e cada linha do feed também.
 * Cada indicador é um atalho para a seção onde se age sobre ele.
 */
import { Link } from '@tanstack/react-router'
import {
  ArrowUpRight,
  BadgeCheck,
  CircleX,
  Clock3,
  Gem,
  PackageX,
  Percent,
  ReceiptText,
  Star,
  TicketPercent,
  TicketX,
  TrendingUp,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { AdminActivity, AdminActivityKind, AdminOverview } from '@/api/admin-contracts'
import { ApiError } from '@/api/http'
import { EmptyState, ErrorState } from '@/components/shared/error-state'
import { Skeleton } from '@/components/ui/skeleton'
import { formatBrl, formatEth } from '@/lib/eth'
import { divEth } from './ui-utils'
import { loadGsap, prefersReducedMotion } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { useAdminActivity, useAdminOrders, useAdminOverview } from '../hooks'
import { PanelPage } from '../shell/panel-page'
import { OrderStatusPill, TimeAgo } from './ui'
import { useNow } from './ui-utils'

const ACTIVITY_ICON: Record<AdminActivityKind, LucideIcon> = {
  'order.created': ReceiptText,
  'order.confirmed': BadgeCheck,
  'order.rejected': CircleX,
  'nft.price': TrendingUp,
  'nft.stock': PackageX,
  'nft.status': Gem,
  'nft.featured': Star,
  'coupon.created': TicketPercent,
  'coupon.deactivated': TicketX,
}

const n = (v: number) => v.toLocaleString('pt-BR')

export function OverviewSection() {
  const overview = useAdminOverview()
  return (
    <PanelPage eyebrow="Painel" title="Visão geral" description="Os números da loja agora e o que acabou de acontecer. Tudo se atualiza sozinho pelo socket.">
      {!overview.data && !overview.isError ? (
        <KpiSkeleton />
      ) : !overview.data ? (
        <ErrorState
          title="Não foi possível carregar os números"
          message={overview.error instanceof ApiError ? overview.error.message : undefined}
          onRetry={() => void overview.refetch()}
          retrying={overview.isFetching}
        />
      ) : (
        <Kpis data={overview.data} />
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <ActivityFeed />
        <RecentOrders />
      </div>
    </PanelPage>
  )
}

function Tile({
  to,
  search,
  label,
  value,
  sub,
  icon: Icon,
  testId,
  className,
  children,
}: {
  to: '/admin/nfts' | '/admin/pedidos' | '/admin/cupons' | '/admin/usuarios'
  search?: Record<string, string>
  label: string
  value: string
  sub?: string
  icon: LucideIcon
  testId: string
  className?: string
  children?: React.ReactNode
}) {
  return (
    <Link
      to={to}
      search={search as never}
      className={cn('kp-ficha kp-tile group flex flex-col gap-3 p-4 transition-colors hover:border-[var(--kp-linha-forte)] hover:bg-[var(--kp-ficha-hover)] sm:p-5', className)}
      data-testid={testId}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="kp-rotulo">{label}</span>
        <Icon className="size-4 text-[var(--kp-fumaca)] transition-colors group-hover:text-[var(--kp-laranja-texto)]" aria-hidden="true" />
      </span>
      <span className="text-[28px] font-bold leading-none tracking-[-0.02em] tabular-nums" data-testid="kpi-value">
        {value}
      </span>
      {sub && <span className="text-[12.5px] leading-5 text-[var(--kp-grafite)]">{sub}</span>}
      {children}
    </Link>
  )
}

/** Barra empilhada com a legenda em texto (a cor nunca é a única informação). */
function Stack({ parts, label }: { parts: Array<{ value: number; className: string; name: string }>; label: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0)
  return (
    <span className="mt-auto flex h-1.5 overflow-hidden rounded-full bg-white/[0.06]" role="img" aria-label={`${label}: ${parts.map((p) => `${p.value} ${p.name}`).join(', ')}`}>
      {total > 0 && parts.map((p) => p.value > 0 && <span key={p.name} className={p.className} style={{ width: `${(p.value / total) * 100}%` }} />)}
    </span>
  )
}

function Kpis({ data }: { data: AdminOverview }) {
  const ref = useRef<HTMLDivElement>(null)
  const animated = useRef(false)
  // Entrada discreta dos indicadores (GSAP, uma vez); com "reduzir movimento" eles só aparecem.
  useEffect(() => {
    if (animated.current || prefersReducedMotion() || !ref.current) return
    animated.current = true
    const tiles = ref.current.querySelectorAll('.kp-tile')
    void loadGsap().then((gsap) => gsap.from(tiles, { opacity: 0, y: 10, duration: 0.45, stagger: 0.045, clearProps: 'opacity,transform' }))
  }, [])

  const { nfts, orders, revenue, users, coupons } = data
  return (
    <section aria-labelledby="kpi-title">
      <h2 id="kpi-title" className="sr-only">
        Indicadores
      </h2>
      {/* 2 colunas até 1279px; depois 4, com a receita ocupando 2×2. As duas grades fecham sem buraco. */}
      <div ref={ref} className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Tile
          to="/admin/pedidos"
          search={{ status: 'confirmed' }}
          label="Receita simulada"
          value={formatEth(revenue.confirmed, { maxDecimals: 4 })}
          sub={`≈ ${formatBrl(revenue.confirmed)} em pedidos confirmados (cotação simulada)`}
          icon={TrendingUp}
          testId="kpi-revenue"
          className="col-span-2 bg-[linear-gradient(135deg,rgb(210_138_76/0.14),transparent_60%)] xl:row-span-2 xl:[&_[data-testid=kpi-value]]:text-[40px]"
        >
          <dl className="mt-auto grid grid-cols-2 gap-3 border-t border-[var(--kp-linha)] pt-4 text-[12.5px]">
            <div>
              <dt className="text-[var(--kp-fumaca)]">Em processamento</dt>
              <dd className="mt-1 text-[15px] font-semibold tabular-nums">{formatEth(revenue.pending, { maxDecimals: 4 })}</dd>
            </div>
            <div>
              <dt className="text-[var(--kp-fumaca)]">Ticket médio</dt>
              <dd className="mt-1 text-[15px] font-semibold tabular-nums">
                {orders.confirmed ? formatEth(divEth(revenue.confirmed, orders.confirmed), { maxDecimals: 4 }) : '—'}
              </dd>
            </div>
          </dl>
        </Tile>
        <Tile to="/admin/nfts" label="NFTs à venda" value={n(nfts.onSale)} sub={`de ${n(nfts.total)} no catálogo`} icon={Gem} testId="kpi-on-sale">
          <Stack
            label="Catálogo"
            parts={[
              { value: nfts.onSale, className: 'bg-success', name: 'à venda' },
              { value: nfts.soldOut, className: 'bg-warning', name: 'esgotados' },
              { value: nfts.unavailable, className: 'bg-[var(--kp-fumaca)]', name: 'fora de venda' },
            ]}
          />
        </Tile>
        <Tile to="/admin/nfts" label="Esgotados" value={n(nfts.soldOut)} sub={nfts.unavailable ? `${n(nfts.unavailable)} fora de venda pelo painel` : 'Sem estoque em nenhuma edição'} icon={PackageX} testId="kpi-sold-out" />
        <Tile to="/admin/pedidos" search={{ status: 'pending' }} label="Pendentes" value={n(orders.pending)} sub="Pagamento em processamento" icon={Clock3} testId="kpi-pending">
          <Stack
            label="Pedidos"
            parts={[
              { value: orders.confirmed, className: 'bg-success', name: 'confirmados' },
              { value: orders.pending, className: 'bg-warning', name: 'pendentes' },
              { value: orders.rejected, className: 'bg-destructive', name: 'recusados' },
            ]}
          />
        </Tile>
        <Tile to="/admin/pedidos" search={{ status: 'confirmed' }} label="Confirmados" value={n(orders.confirmed)} sub={`de ${n(orders.total)} ${orders.total === 1 ? 'pedido' : 'pedidos'}`} icon={BadgeCheck} testId="kpi-confirmed" />
        <Tile to="/admin/pedidos" search={{ status: 'rejected' }} label="Recusados" value={n(orders.rejected)} sub="Estoque devolvido ao catálogo" icon={CircleX} testId="kpi-rejected" />
        <Tile to="/admin/usuarios" label="Usuários" value={n(users.total)} sub={`${n(users.admins)} ${users.admins === 1 ? 'administrador' : 'administradores'}`} icon={UsersRound} testId="kpi-users" />
        <Tile to="/admin/cupons" label="Cupons ativos" value={n(coupons.active)} sub="Valendo no carrinho agora" icon={Percent} testId="kpi-coupons" />
        <Tile to="/admin/nfts" label="Em destaque" value={n(nfts.featured)} sub="Na vitrine do início da loja" icon={Star} testId="kpi-featured" />
      </div>
    </section>
  )
}

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-busy="true" aria-label="Carregando indicadores">
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} className={cn('kp-ficha flex flex-col gap-3 p-5', i === 0 && 'col-span-2 xl:row-span-2')} aria-hidden="true">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  )
}

function ActivityFeed() {
  const activity = useAdminActivity()
  const now = useNow()
  // O que já tinha acontecido ao abrir não pisca; o que chega depois (pelo socket) ganha o brilho de "novo".
  const [openedAt] = useState(() => Date.now())

  return (
    <section aria-labelledby="activity-title" className="kp-ficha flex min-w-0 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--kp-linha)] px-5 py-4">
        <h2 id="activity-title" className="text-[15px] font-bold">
          Últimos eventos
        </h2>
        <span className="text-[12px] text-[var(--kp-fumaca)]">em tempo real</span>
      </header>
      {!activity.data && !activity.isError ? (
        <ul className="flex flex-col gap-4 p-5" aria-busy="true" aria-label="Carregando eventos">
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="flex gap-3" aria-hidden="true">
              <Skeleton className="size-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </li>
          ))}
        </ul>
      ) : !activity.data ? (
        <ErrorState className="m-4 border-0" title="Não foi possível carregar os eventos" onRetry={() => void activity.refetch()} retrying={activity.isFetching} />
      ) : activity.data.items.length === 0 ? (
        <EmptyState
          className="m-4 border-0 bg-transparent"
          title="Nada aconteceu ainda"
          message="Pedidos, mudanças de preço e de estoque, destaques e cupons aparecem aqui assim que acontecem, nesta ou em outra aba."
        />
      ) : (
        <ol className="flex flex-col p-2" aria-live="polite" aria-relevant="additions" data-testid="activity-feed">
          {activity.data.items.map((a) => (
            <ActivityRow key={a.id} activity={a} now={now} fresh={Date.parse(a.occurredAt) > openedAt} />
          ))}
        </ol>
      )}
    </section>
  )
}

function ActivityRow({ activity, now, fresh }: { activity: AdminActivity; now: number; fresh: boolean }) {
  const Icon = ACTIVITY_ICON[activity.kind]
  const tone = activity.kind === 'order.rejected' || activity.kind === 'coupon.deactivated' ? 'text-[#f08a83]' : activity.kind === 'order.confirmed' ? 'text-success' : 'text-[var(--kp-laranja-texto)]'
  return (
    <li className={cn('flex gap-3 rounded-[10px] px-3 py-2.5', fresh && 'kp-chegou')} data-testid="activity-item" data-kind={activity.kind}>
      <span className={cn('mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-white/[0.04]', tone)} aria-hidden="true">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-semibold">{activity.title}</p>
        <p className="truncate text-[12.5px] text-[var(--kp-grafite)]">{activity.detail}</p>
      </div>
      <span className="shrink-0 pt-0.5 text-[11.5px] text-[var(--kp-fumaca)]">
        <TimeAgo iso={activity.occurredAt} now={now} />
      </span>
    </li>
  )
}

function RecentOrders() {
  const orders = useAdminOrders({ pageSize: 5 })
  const now = useNow()
  return (
    <section aria-labelledby="recent-orders-title" className="kp-ficha flex min-w-0 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--kp-linha)] px-5 py-4">
        <h2 id="recent-orders-title" className="text-[15px] font-bold">
          Pedidos recentes
        </h2>
        <Link to="/admin/pedidos" className="inline-flex items-center gap-1 rounded-md text-[12.5px] font-semibold text-[var(--kp-laranja-texto)] hover:underline">
          Ver todos
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
      </header>
      {!orders.data && !orders.isError ? (
        <ul className="flex flex-col gap-4 p-5" aria-busy="true" aria-label="Carregando pedidos">
          {Array.from({ length: 3 }, (_, i) => (
            <li key={i} className="flex items-center gap-3" aria-hidden="true">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </li>
          ))}
        </ul>
      ) : !orders.data ? (
        <ErrorState className="m-4 border-0" title="Não foi possível carregar os pedidos" onRetry={() => void orders.refetch()} retrying={orders.isFetching} />
      ) : orders.data.items.length === 0 ? (
        <EmptyState className="m-4 border-0 bg-transparent" title="Nenhum pedido ainda" message="Quando alguém comprar na loja, o pedido aparece aqui com o status ao vivo." />
      ) : (
        <ul className="flex flex-col p-2" data-testid="recent-orders">
          {orders.data.items.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[10px] px-3 py-2.5">
              <span className="w-[86px] shrink-0 text-[13px] font-bold tabular-nums">{o.number}</span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--kp-grafite)]">
                @{o.customer.username} · {formatEth(o.total, { maxDecimals: 4 })}
              </span>
              <span className="shrink-0 text-[11.5px] text-[var(--kp-fumaca)]">
                <TimeAgo iso={o.createdAt} now={now} />
              </span>
              <OrderStatusPill status={o.status} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
