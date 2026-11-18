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
import { formatBrl, formatEth } from '@/lib/eth'
import { divEth } from './ui-utils'
import { loadGsap, prefersReducedMotion } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { useAdminActivity, useAdminOrders, useAdminOverview } from '../hooks'
import { PanelPage } from '../shell/panel-page'
import { sectionMeta } from '../shell/sections'
import { LoadingNote, OrderStatusPill, Sk, SkBlock, SkLines, StatusPillSkeleton, TimeAgo } from './ui'
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

const META = sectionMeta('/admin')

export function OverviewSection() {
  const overview = useAdminOverview()
  return (
    <PanelPage eyebrow={META.eyebrow} title={META.label} description={META.intro}>
      <OverviewBody overview={overview} />
    </PanelPage>
  )
}

/** Corpo da visão geral. Sem consulta (casca ainda conferindo o acesso), tudo aparece em skeleton. */
export function OverviewBody({ overview }: { overview?: ReturnType<typeof useAdminOverview> }) {
  return (
    <>
      {!overview || (!overview.data && !overview.isError) ? (
        <Kpis />
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
        {overview ? <ActivityFeed /> : <ActivityFeedFrame body={<ActivitySkeleton />} />}
        {overview ? <RecentOrders /> : <RecentOrdersFrame body={<RecentOrdersSkeleton />} />}
      </div>
    </>
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
  loading = false,
  fixedSub = false,
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
  /** Sem dado ainda: o nome e o ícone ficam, o número e a frase viram skeleton do mesmo tamanho. */
  loading?: boolean
  /** A frase é fixa (não vem da API): continua visível durante o carregamento. */
  fixedSub?: boolean
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
      <span className="text-[28px] font-bold leading-none tracking-[-0.02em] tabular-nums" data-testid={loading ? undefined : 'kpi-value'} data-kpi-value>
        {loading ? <Sk>{value}</Sk> : value}
      </span>
      {sub && <span className="text-[12.5px] leading-5 text-[var(--kp-grafite)]">{loading && !fixedSub ? <SkLines>{sub}</SkLines> : sub}</span>}
      {children}
    </Link>
  )
}

/** Barra empilhada com a legenda em texto (a cor nunca é a única informação). Sem dado, a barra vazia brilha. */
function Stack({ parts, label }: { parts?: Array<{ value: number; className: string; name: string }>; label: string }) {
  if (!parts) return <span aria-hidden="true" className="kp-sk-bloco mt-auto flex h-1.5 rounded-full" />
  const total = parts.reduce((s, p) => s + p.value, 0)
  return (
    <span className="mt-auto flex h-1.5 overflow-hidden rounded-full bg-[rgb(var(--kp-veu-rgb)/0.06)]" role="img" aria-label={`${label}: ${parts.map((p) => `${p.value} ${p.name}`).join(', ')}`}>
      {total > 0 && parts.map((p) => p.value > 0 && <span key={p.name} className={p.className} style={{ width: `${(p.value / total) * 100}%` }} />)}
    </span>
  )
}

/**
 * Indicadores. Sem `data` eles já aparecem com o nome, o ícone e o lugar de cada número (skeleton com texto de
 * exemplo no mesmo tamanho): quando os números chegam, nada se move, só os valores surgem.
 */
function Kpis({ data }: { data?: AdminOverview }) {
  const ref = useRef<HTMLDivElement>(null)
  const animated = useRef(false)
  const loading = !data
  // Os números entram com um movimento curto quando chegam (GSAP, uma vez); com "reduzir movimento", só aparecem.
  useEffect(() => {
    if (loading || animated.current || prefersReducedMotion() || !ref.current) return
    animated.current = true
    const values = ref.current.querySelectorAll('[data-kpi-value]')
    void loadGsap().then((gsap) => gsap.from(values, { opacity: 0, y: 6, duration: 0.4, stagger: 0.035, clearProps: 'opacity,transform' }))
  }, [loading])

  const nfts = data?.nfts
  const orders = data?.orders
  const revenue = data?.revenue
  const v = (fn: () => string, sample: string) => (data ? fn() : sample)
  return (
    <section aria-labelledby="kpi-title" aria-busy={loading || undefined}>
      <h2 id="kpi-title" className="sr-only">
        Indicadores
      </h2>
      {loading && <LoadingNote>Carregando indicadores…</LoadingNote>}
      {/* 2 colunas até 1279px; depois 4, com a receita ocupando 2×2. As duas grades fecham sem buraco. */}
      <div ref={ref} className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Tile
          to="/admin/pedidos"
          search={{ status: 'confirmed' }}
          label="Receita simulada"
          value={v(() => formatEth(revenue!.confirmed, { maxDecimals: 4 }), '0.0000 ETH')}
          sub={v(() => `≈ ${formatBrl(revenue!.confirmed)} em pedidos confirmados (cotação simulada)`, '≈ R$ 0,00 em pedidos confirmados (cotação simulada)')}
          icon={TrendingUp}
          testId="kpi-revenue"
          loading={loading}
          className="col-span-2 bg-[linear-gradient(135deg,rgb(210_138_76/0.14),transparent_60%)] xl:row-span-2 xl:[&_[data-kpi-value]]:text-[40px]"
        >
          <dl className="mt-auto grid grid-cols-2 gap-3 border-t border-[var(--kp-linha)] pt-4 text-[12.5px]">
            <div>
              <dt className="text-[var(--kp-fumaca)]">Em processamento</dt>
              <dd className="mt-1 text-[15px] font-semibold tabular-nums">{data ? formatEth(revenue!.pending, { maxDecimals: 4 }) : <Sk>0.0000 ETH</Sk>}</dd>
            </div>
            <div>
              <dt className="text-[var(--kp-fumaca)]">Ticket médio</dt>
              <dd className="mt-1 text-[15px] font-semibold tabular-nums">
                {!data ? <Sk>0.0000 ETH</Sk> : orders!.confirmed ? formatEth(divEth(revenue!.confirmed, orders!.confirmed), { maxDecimals: 4 }) : '—'}
              </dd>
            </div>
          </dl>
        </Tile>
        <Tile to="/admin/nfts" label="NFTs à venda" value={v(() => n(nfts!.onSale), '00')} sub={v(() => `de ${n(nfts!.total)} no catálogo`, 'de 00 no catálogo')} icon={Gem} testId="kpi-on-sale" loading={loading}>
          <Stack
            label="Catálogo"
            parts={
              nfts && [
                { value: nfts.onSale, className: 'bg-success', name: 'à venda' },
                { value: nfts.soldOut, className: 'bg-warning', name: 'esgotados' },
                { value: nfts.unavailable, className: 'bg-[var(--kp-fumaca)]', name: 'fora de venda' },
              ]
            }
          />
        </Tile>
        <Tile
          to="/admin/nfts"
          label="Esgotados"
          value={v(() => n(nfts!.soldOut), '0')}
          sub={v(() => (nfts!.unavailable ? `${n(nfts!.unavailable)} fora de venda pelo painel` : 'Sem estoque em nenhuma edição'), 'Sem estoque em nenhuma edição')}
          icon={PackageX}
          testId="kpi-sold-out"
          loading={loading}
        />
        <Tile to="/admin/pedidos" search={{ status: 'pending' }} label="Pendentes" value={v(() => n(orders!.pending), '0')} sub="Pagamento em processamento" fixedSub icon={Clock3} testId="kpi-pending" loading={loading}>
          <Stack
            label="Pedidos"
            parts={
              orders && [
                { value: orders.confirmed, className: 'bg-success', name: 'confirmados' },
                { value: orders.pending, className: 'bg-warning', name: 'pendentes' },
                { value: orders.rejected, className: 'bg-destructive', name: 'recusados' },
              ]
            }
          />
        </Tile>
        <Tile
          to="/admin/pedidos"
          search={{ status: 'confirmed' }}
          label="Confirmados"
          value={v(() => n(orders!.confirmed), '0')}
          sub={v(() => `de ${n(orders!.total)} ${orders!.total === 1 ? 'pedido' : 'pedidos'}`, 'de 0 pedidos')}
          icon={BadgeCheck}
          testId="kpi-confirmed"
          loading={loading}
        />
        <Tile to="/admin/pedidos" search={{ status: 'rejected' }} label="Recusados" value={v(() => n(orders!.rejected), '0')} sub="Estoque devolvido ao catálogo" fixedSub icon={CircleX} testId="kpi-rejected" loading={loading} />
        <Tile
          to="/admin/usuarios"
          label="Usuários"
          value={v(() => n(data!.users.total), '0')}
          sub={v(() => `${n(data!.users.admins)} ${data!.users.admins === 1 ? 'administrador' : 'administradores'}`, '1 administrador')}
          icon={UsersRound}
          testId="kpi-users"
          loading={loading}
        />
        <Tile to="/admin/cupons" label="Cupons ativos" value={v(() => n(data!.coupons.active), '0')} sub="Valendo no carrinho agora" fixedSub icon={Percent} testId="kpi-coupons" loading={loading} />
        <Tile to="/admin/nfts" label="Em destaque" value={v(() => n(nfts!.featured), '0')} sub="Na vitrine do início da loja" fixedSub icon={Star} testId="kpi-featured" loading={loading} />
      </div>
    </section>
  )
}

function ActivityFeedFrame({ body }: { body: React.ReactNode }) {
  return (
    <section aria-labelledby="activity-title" className="kp-ficha flex min-w-0 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--kp-linha)] px-5 py-4">
        <h2 id="activity-title" className="text-[15px] font-bold">
          Últimos eventos
        </h2>
        <span className="text-[12px] text-[var(--kp-fumaca)]">em tempo real</span>
      </header>
      {body}
    </section>
  )
}

/** Mesma marcação do ActivityRow (ícone, título, detalhe e hora), com textos de exemplo cobertos. */
function ActivitySkeleton() {
  return (
    <div aria-busy="true">
      <LoadingNote>Carregando eventos…</LoadingNote>
      <ol className="flex flex-col p-2" aria-hidden="true" data-testid="activity-skeleton">
        {[
          ['Pedido JG-00012 recebido', 'ana_nft · 1 item · 0.4830 ETH'],
          ['Preço de Emerald Ape #042', 'Edição Ouro: 1.25 ETH → 1.1 ETH'],
          ['Pedido JG-00011 confirmado', 'ana_nft · 0.966 ETH'],
          ['Cupom KURIO10 criado', '10% · sem validade'],
        ].map(([title, detail]) => (
          <li key={title} className="flex gap-3 rounded-[10px] px-3 py-2.5">
            <SkBlock className="mt-0.5 size-8 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-semibold">
                <Sk>{title}</Sk>
              </p>
              <p className="truncate text-[12.5px]">
                <Sk>{detail}</Sk>
              </p>
            </div>
            <span className="shrink-0 pt-0.5 text-[11.5px]">
              <Sk>há 3 min</Sk>
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function ActivityFeed() {
  const activity = useAdminActivity()
  const now = useNow()
  // O que já tinha acontecido ao abrir não pisca; o que chega depois (pelo socket) ganha o brilho de "novo".
  const [openedAt] = useState(() => Date.now())

  return (
    <ActivityFeedFrame
      body={
        !activity.data && !activity.isError ? (
          <ActivitySkeleton />
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
        )
      }
    />
  )
}
function ActivityRow({ activity, now, fresh }: { activity: AdminActivity; now: number; fresh: boolean }) {
  const Icon = ACTIVITY_ICON[activity.kind]
  const tone = activity.kind === 'order.rejected' || activity.kind === 'coupon.deactivated' ? 'text-[var(--kp-perigo-texto)]' : activity.kind === 'order.confirmed' ? 'text-success' : 'text-[var(--kp-laranja-texto)]'
  return (
    <li className={cn('flex gap-3 rounded-[10px] px-3 py-2.5', fresh && 'kp-chegou')} data-testid="activity-item" data-kind={activity.kind}>
      <span className={cn('mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-[rgb(var(--kp-veu-rgb)/0.04)]', tone)} aria-hidden="true">
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

function RecentOrdersFrame({ body }: { body: React.ReactNode }) {
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
      {body}
    </section>
  )
}

/** Mesma linha dos pedidos recentes (número, cliente · total, hora e status), cinco vezes (é o tamanho da página). */
function RecentOrdersSkeleton() {
  return (
    <div aria-busy="true">
      <LoadingNote>Carregando pedidos…</LoadingNote>
      <ul className="flex flex-col p-2" aria-hidden="true" data-testid="recent-orders-skeleton">
        {['Confirmado', 'Processando', 'Confirmado', 'Recusado', 'Confirmado'].map((status, i) => (
          <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[10px] px-3 py-2.5">
            <span className="w-[86px] shrink-0 text-[13px] font-bold tabular-nums">
              <Sk>JG-00000</Sk>
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px]">
              <Sk>@ana_nft · 0.483 ETH</Sk>
            </span>
            <span className="shrink-0 text-[11.5px]">
              <Sk>há 3 min</Sk>
            </span>
            <StatusPillSkeleton label={status} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function RecentOrders() {
  const orders = useAdminOrders({ pageSize: 5 })
  const now = useNow()
  return (
    <RecentOrdersFrame
      body={
        !orders.data && !orders.isError ? (
          <RecentOrdersSkeleton />
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
        )
      }
    />
  )
}
