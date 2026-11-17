/**
 * Pedido: pendente → confirmado ou recusado (estados terminais).
 *
 * O estado vem da API (GET /orders/:id) e é atualizado por `order.updated` no Socket.IO.
 * Se o socket cair, a reconexão refaz a consulta; e enquanto pendente há uma conferência
 * a cada 5 s como rede de segurança. A tela de confirmação SÓ aparece quando a API diz
 * "confirmed" — nunca por suposição do front.
 * O recibo mostra o snapshot gravado no pedido (preços do momento da compra).
 */
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Copy, Loader2, X, XCircle } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import type { Order } from '@/api/contracts'
import { ApiError } from '@/api/http'
import { orderQuery } from '@/api/queries'
import { NotFound } from '@/components/layout/not-found'
import { ErrorState } from '@/components/shared/error-state'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useSession } from '@/features/auth/use-session'
import { NETWORK_LABEL } from '@/features/catalog/search-params'
import { announce } from '@/lib/announcer'
import { formatEth } from '@/lib/eth'
import { useRealtimeClient } from '@/realtime/provider'
import { rememberPendingOrder } from './order-attempt'

const PROVIDER_LABEL = { walletconnect: 'WalletConnect', metamask: 'MetaMask', coinbase: 'Coinbase Wallet' } as const

export function OrderPage({ orderId }: { orderId: string }) {
  const { user } = useSession()
  const query = useQuery(orderQuery(user!.id, orderId))
  const realtime = useRealtimeClient()
  const status = query.data?.status
  const previous = useRef(status)

  // Versão vinda da REST entra no controle de versões do socket (evento mais velho é ignorado).
  useEffect(() => {
    if (query.data) realtime?.noteVersion(`order:${query.data.id}`, query.data.version)
  }, [query.data, realtime])

  useEffect(() => {
    if (!status || previous.current === status) return
    previous.current = status
    if (status === 'confirmed') announce('Pagamento confirmado. Seus NFTs estão na sua carteira.', 'assertive')
    if (status === 'rejected') announce('Pagamento recusado. Seus itens continuam no carrinho.', 'assertive')
    if (status !== 'pending') rememberPendingOrder(user!.id, null)
  }, [status, user])

  if (query.isError) {
    if (query.error instanceof ApiError && (query.error.code === 'NOT_FOUND' || query.error.code === 'FORBIDDEN')) {
      return <NotFound title="Pedido não encontrado" description="Este pedido não existe ou pertence a outra conta." />
    }
    return (
      <div className="container-page py-16">
        <ErrorState title="Não foi possível carregar o pedido" message={query.error.message} onRetry={() => void query.refetch()} retrying={query.isFetching} />
      </div>
    )
  }
  if (query.isPending) {
    return (
      <div className="container-page flex justify-center py-10" aria-busy="true" aria-label="Carregando pedido">
        <Skeleton className="h-[520px] w-full max-w-[520px]" />
      </div>
    )
  }

  const order = query.data
  return (
    <div className="container-page flex justify-center py-6 md:py-10" data-testid="order-page" data-status={order.status}>
      {order.status === 'pending' && <Pending order={order} />}
      {order.status === 'confirmed' && <Receipt order={order} />}
      {order.status === 'rejected' && <Rejected order={order} />}
    </div>
  )
}

function Pending({ order }: { order: Order }) {
  return (
    <section role="status" aria-live="polite" className="w-full max-w-[520px] rounded-lg bg-card p-8 text-center" aria-labelledby="pending-title">
      <Loader2 className="mx-auto size-10 animate-spin text-primary" aria-hidden="true" />
      <h1 id="pending-title" className="mt-4 text-xl font-bold">
        Processando pagamento
      </h1>
      <p className="mt-2 text-[13px] text-muted-foreground">
        Pedido {order.number} · {formatEth(order.total)}. Aguardando a confirmação da rede {NETWORK_LABEL[order.network]}. Pode fechar ou recarregar esta página: o status é recuperado sem criar outra compra.
      </p>
    </section>
  )
}

function Rejected({ order }: { order: Order }) {
  return (
    <section className="w-full max-w-[520px] rounded-lg bg-card p-8 text-center" aria-labelledby="rejected-title">
      <XCircle className="mx-auto size-10 text-destructive" aria-hidden="true" />
      <h1 id="rejected-title" className="mt-4 text-xl font-bold">
        Pagamento recusado
      </h1>
      <p className="mt-2 text-[13px] text-muted-foreground" data-testid="rejection-reason">
        {order.failureReason ?? 'A carteira recusou o pagamento.'}
      </p>
      <p className="mt-2 text-[13px]">Nada foi cobrado e seus itens continuam no carrinho.</p>
      <div className="mt-6 flex justify-center gap-3">
        <Link to="/carrinho" className={buttonVariants({ variant: 'outline' })}>
          Voltar ao carrinho
        </Link>
        <Link to="/pagamento" className={buttonVariants()}>
          Tentar novamente
        </Link>
      </div>
    </section>
  )
}

function Receipt({ order }: { order: Order }) {
  const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`.toUpperCase().replace('0X', '0x')
  const date = new Date(order.updatedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
  return (
    <section className="w-full max-w-[520px] overflow-hidden rounded-lg bg-card" aria-labelledby="receipt-title" data-testid="receipt">
      <div className="relative px-6 pb-4 pt-8 text-center">
        <Link to="/" className="absolute right-3 top-3 grid size-8 place-items-center rounded text-primary hover:bg-secondary" aria-label="Fechar e voltar ao início">
          <X className="size-4" aria-hidden="true" />
        </Link>
        <svg viewBox="0 0 64 64" className="mx-auto size-16 text-primary" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M8 26 32 8l24 18v30H8z" />
          <path d="m8 26 24 18 24-18" />
          <rect x="16" y="14" width="32" height="20" rx="2" fill="var(--card)" />
          <text x="32" y="23" textAnchor="middle" fontSize="7" fontWeight="700" fill="currentColor" stroke="none">THANK</text>
          <text x="32" y="31" textAnchor="middle" fontSize="7" fontWeight="700" fill="currentColor" stroke="none">YOU</text>
        </svg>
        <h1 id="receipt-title" className="mt-3 text-[15px] font-semibold text-muted-foreground">
          Seus NFTs agora estão na sua carteira
        </h1>
      </div>

      <dl className="grid grid-cols-2 gap-y-3 border-y border-primary/60 px-5 py-3 text-[12px] sm:grid-cols-4 sm:divide-x sm:divide-primary/40">
        <div className="sm:pr-3">
          <dt className="font-bold">ID da transação</dt>
          <dd className="flex items-center gap-1 text-muted-foreground" data-testid="tx-hash">
            {order.txHash ? short(order.txHash) : '—'}
            {order.txHash && (
              <button
                type="button"
                className="rounded p-0.5 hover:text-primary"
                aria-label="Copiar ID da transação"
                onClick={() => void navigator.clipboard?.writeText(order.txHash!).then(() => toast.success('ID copiado'))}
              >
                <Copy className="size-3" aria-hidden="true" />
              </button>
            )}
          </dd>
        </div>
        <div className="sm:px-3">
          <dt className="font-bold">Data</dt>
          <dd className="text-muted-foreground">{date}</dd>
        </div>
        <div className="sm:px-3">
          <dt className="font-bold">Total</dt>
          <dd className="text-muted-foreground">{formatEth(order.total)}</dd>
        </div>
        <div className="sm:pl-3">
          <dt className="font-bold">Carteira</dt>
          <dd className="text-muted-foreground">{PROVIDER_LABEL[order.wallet.provider]}</dd>
        </div>
      </dl>

      <div className="px-6 py-5">
        <h2 className="text-[13px] font-bold">Detalhes da transação</h2>
        <table className="mt-2 w-full text-[13px]">
          <caption className="sr-only">Itens do pedido {order.number}</caption>
          <thead>
            <tr className="border-b border-border text-left">
              <th scope="col" className="pb-2 font-semibold">NFTs</th>
              <th scope="col" className="pb-2 text-center font-semibold">Edições</th>
              <th scope="col" className="pb-2 text-right font-semibold">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((l) => (
              <tr key={`${l.nftId}-${l.editionId}`} data-testid="receipt-line">
                <td className="py-2">
                  <div className="flex items-center gap-2">
                    <img src={l.image} alt="" width={40} height={40} className="size-10 rounded-sm object-cover" />
                    <div>
                      <p className="font-bold">{l.name}</p>
                      <p className="text-[11px] text-muted-foreground">Edição {l.editionName} · {formatEth(l.unitPrice)} cada</p>
                    </div>
                  </div>
                </td>
                <td className="text-center text-muted-foreground">(x {l.quantity})</td>
                <td className="text-right font-bold text-primary">{formatEth(l.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="mt-2 ml-auto w-56 space-y-1 text-[13px]">
          {order.discount !== '0' && (
            <div className="flex justify-between">
              <dt>Desconto</dt>
              <dd>(-) {formatEth(order.discount)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt>Taxa de rede</dt>
            <dd>{formatEth(order.networkFee)}</dd>
          </div>
          <div className="flex justify-between font-bold">
            <dt>Total</dt>
            <dd className="text-primary" data-testid="receipt-total">{formatEth(order.total)}</dd>
          </div>
        </dl>
        <p className="mt-4 border-t border-border pt-3 text-center text-[12px] text-muted-foreground">
          Transação confirmada na {NETWORK_LABEL[order.network]}. A propriedade foi transferida para sua carteira conectada e registrada na rede. Pedido {order.number}. Referência e link de exploração simulados.
        </p>
        {order.explorerUrl && (
          <div className="mt-4 text-center">
            <a href={order.explorerUrl} target="_blank" rel="noreferrer" className={buttonVariants()}>
              Ver no explorador (simulado)
              <span className="sr-only"> — abre em nova aba</span>
            </a>
          </div>
        )}
      </div>
      <div className="h-2 bg-primary" aria-hidden="true" />
    </section>
  )
}
