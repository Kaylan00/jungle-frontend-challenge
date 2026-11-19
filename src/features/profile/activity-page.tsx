/**
 * "Atividade" (/perfil/atividade): histórico de compras da conta logada (GET /orders, só os pedidos dela).
 * Cada pedido mostra número, data, itens, total, rede e status, com link para o recibo (/pedido/:id).
 * Pedido pendente vira confirmado ou recusado ao vivo: o evento order.updated do socket atualiza a lista com as
 * mesmas regras do recibo (versão, terminal não regride) e a mudança é anunciada ao leitor de tela.
 */
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { CheckCircle2, ChevronRight, Clock3, XCircle, type LucideIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { Order, OrderStatus } from '@/api/contracts'
import { ApiError } from '@/api/http'
import { ordersQuery } from '@/api/queries'
import { EmptyState, ErrorState } from '@/components/shared/error-state'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useSession } from '@/features/auth/use-session'
import { NETWORK_LABEL } from '@/features/catalog/search-params'
import { announce } from '@/lib/announcer'
import { ART_SIZES, artSources } from '@/lib/art'
import { formatEth } from '@/lib/eth'
import { cn } from '@/lib/utils'
import { ProfileLayout } from './profile-layout'

const STATUS: Record<OrderStatus, { label: string; icon: LucideIcon; className: string }> = {
  pending: { label: 'Pendente', icon: Clock3, className: 'border-warning/50 bg-warning/10 text-warning' },
  confirmed: { label: 'Confirmado', icon: CheckCircle2, className: 'border-success/50 bg-success/10 text-success' },
  // Coral em vez do vermelho do tema: o vermelho fica abaixo de 4,5:1 como texto sobre o card escuro.
  rejected: { label: 'Recusado', icon: XCircle, className: 'border-[#f0805f]/50 bg-[#f0805f]/10 text-[#f0805f]' },
}

/** "18 Nov, 2026 às 14:32" (o dia no formato do recibo do Figma, mais a hora). */
function orderDate(iso: string) {
  const d = new Date(iso)
  const month = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return `${String(d.getDate()).padStart(2, '0')} ${month.charAt(0).toUpperCase()}${month.slice(1)}, ${d.getFullYear()} às ${time}`
}

export function ActivityPage() {
  const { user } = useSession()
  const orders = useQuery(ordersQuery(user!.id))
  const items = orders.data?.items
  useAnnounceStatusChanges(items)

  return (
    <ProfileLayout title="Atividade">
      <ActivityHeader count={items?.length} />
      {orders.isPending ? (
        <ActivitySkeleton />
      ) : orders.isError ? (
        <ErrorState
          title="Não foi possível carregar suas compras"
          message={orders.error instanceof ApiError ? orders.error.message : undefined}
          onRetry={() => void orders.refetch()}
          retrying={orders.isFetching}
        />
      ) : orders.data.items.length === 0 ? (
        <EmptyState
          title="Você ainda não comprou nenhum NFT"
          message="Quando você comprar, o pedido, o status do pagamento e o recibo aparecem aqui."
          action={
            <Link to="/" hash="catalogo" className={buttonVariants()}>
              Explorar o catálogo
            </Link>
          }
        />
      ) : (
        <ul className="space-y-4" data-testid="activity-list" aria-label="Suas compras">
          {orders.data.items.map((order) => (
            <li key={order.id}>
              <OrderRow order={order} />
            </li>
          ))}
        </ul>
      )}
    </ProfileLayout>
  )
}

function ActivityHeader({ count }: { count?: number }) {
  return (
    <div className="mb-5 flex items-baseline justify-between gap-4">
      <h2 className="text-[14px] font-bold">Atividade</h2>
      {count !== undefined && count > 0 && (
        <p className="text-[13px] text-muted-foreground">
          {count} {count === 1 ? 'compra' : 'compras'}
        </p>
      )}
    </div>
  )
}

/** Mudança de status vinda do socket (pendente → confirmado/recusado) anunciada uma vez, sem depender de cor. */
function useAnnounceStatusChanges(items: Order[] | undefined) {
  const previous = useRef(new Map<string, OrderStatus>())
  useEffect(() => {
    if (!items) return
    for (const o of items) {
      const before = previous.current.get(o.id)
      if (before === 'pending' && o.status !== 'pending') {
        announce(o.status === 'confirmed' ? `Pedido ${o.number} confirmado.` : `Pedido ${o.number} recusado.`, 'assertive')
      }
      previous.current.set(o.id, o.status)
    }
  }, [items])
}

function StatusBadge({ status }: { status: OrderStatus }) {
  const { label, icon: Icon, className } = STATUS[status]
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-semibold leading-5', className)} data-testid="order-status">
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </span>
  )
}

function OrderRow({ order }: { order: Order }) {
  const quantity = order.lines.reduce((sum, l) => sum + l.quantity, 0)
  const [first, ...rest] = order.lines
  const names = first ? (rest.length ? `${first.name} e mais ${rest.length}` : first.name) : ''
  return (
    <article
      aria-labelledby={`order-${order.id}`}
      className="rounded-lg border border-border bg-card p-4 md:p-5"
      data-testid="activity-order"
      data-order-id={order.id}
      data-status={order.status}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 id={`order-${order.id}`} className="text-[15px] font-bold leading-6">
            Pedido {order.number}
          </h3>
          <p className="text-[13px] leading-5 text-muted-foreground">
            <time dateTime={order.createdAt}>{orderDate(order.createdAt)}</time>
          </p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex shrink-0 -space-x-3" aria-hidden="true">
            {order.lines.slice(0, 3).map((l) => (
              <img
                key={`${l.nftId}-${l.editionId}`}
                {...artSources(l.image, ART_SIZES.reviewRow)}
                alt=""
                width={44}
                height={44}
                loading="lazy"
                className="size-11 rounded-md border-2 border-card object-cover"
              />
            ))}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold leading-5">{names}</p>
            <p className="text-[13px] leading-5 text-muted-foreground">
              {quantity} {quantity === 1 ? 'NFT' : 'NFTs'} · {NETWORK_LABEL[order.network]}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 max-md:w-full max-md:justify-between">
          <p className="md:text-right">
            <span className="block text-[12px] leading-4 text-muted-foreground">Total</span>
            <span className="text-[16px] font-bold leading-6 text-highlight" data-testid="activity-total">
              {formatEth(order.total)}
            </span>
          </p>
          <Link
            to="/pedido/$orderId"
            params={{ orderId: order.id }}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1')}
            aria-label={`Ver recibo do pedido ${order.number}`}
          >
            Ver recibo
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </div>

      {order.status === 'pending' && <p className="mt-3 text-[13px] leading-5 text-warning">Aguardando a confirmação do pagamento.</p>}
      {order.status === 'rejected' && order.failureReason && (
        <p className="mt-3 text-[13px] leading-5 text-[#f0805f]">{order.failureReason}</p>
      )}
    </article>
  )
}

function ActivitySkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" data-testid="activity-loading">
      <p className="sr-only" role="status">
        Carregando suas compras…
      </p>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-4 md:p-5" aria-hidden="true">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-44" />
            </div>
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Skeleton className="size-11 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Enquanto a sessão da rota privada é conferida: o layout do perfil, o título e os pedidos em skeleton. */
export function ActivityPending() {
  return (
    <ProfileLayout title="Atividade">
      <ActivityHeader />
      <ActivitySkeleton />
    </ProfileLayout>
  )
}
