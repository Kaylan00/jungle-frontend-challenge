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
import { ART_SIZES, artSources } from '@/lib/art'
import { formatEth } from '@/lib/eth'
import { cn } from '@/lib/utils'
import { useRealtimeClient } from '@/realtime/use-realtime'
import { rememberPendingOrder } from './order-attempt'

const PROVIDER_LABEL = {
  walletconnect: 'WalletConnect',
  metamask: 'MetaMask',
  coinbase: 'Coinbase Wallet',
} as const

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
      <div className="container-page flex justify-center py-6 md:pb-[97px] md:pt-[97px]" aria-busy="true" aria-label="Carregando pedido" data-testid="order-loading">
        <p className="sr-only">Carregando pedido…</p>
        <ReceiptSkeleton />
      </div>
    )
  }

  const order = query.data
  return (
    <div className="container-page flex justify-center py-6 md:pb-[97px] md:pt-[97px]" data-testid="order-page" data-status={order.status}>
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
        Pedido {order.number} · {formatEth(order.total)}. Aguardando a confirmação da rede {NETWORK_LABEL[order.network]}. Pode fechar ou recarregar esta página: o status é recuperado sem criar outra
        compra.
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

const EXPLORER_LABEL = {
  ethereum: 'Etherscan',
  polygon: 'Polygonscan',
  solana: 'Solana Explorer',
} as const

/** Data no formato do Figma: "29 Jul, 2026". */
function receiptDate(iso: string) {
  const d = new Date(iso)
  const month = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
  return `${String(d.getDate()).padStart(2, '0')} ${month.charAt(0).toUpperCase()}${month.slice(1)}, ${d.getFullYear()}`
}

/** Ícone "THANK YOU" do Figma: carta saindo do envelope aberto. */
function ThankYouIcon() {
  return (
    <svg
      viewBox="0 0 72 86"
      width={72}
      height={86}
      className="mx-auto block text-primary"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M28 9a8 7 0 0 1 16 0" />
      <path d="M9.5 47V11.5a2 2 0 0 1 2-2h49a2 2 0 0 1 2 2V47" />
      <path d="M9.5 29.5 5 33v46a2 2 0 0 0 2 2h58a2 2 0 0 0 2-2V33l-4.5-3.5" />
      <path d="M6 79 32.5 50a4.5 4.5 0 0 1 7 0L50 61.5M54.5 66 66 79" />
      <path d="M5.5 42.5 21.5 58M66.5 42.5 50.5 58" />
      <text
        x="36"
        y="27.5"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="10.5"
        fontWeight="700"
        fill="currentColor"
        stroke="none"
        textLength="40"
        lengthAdjust="spacingAndGlyphs"
      >
        THANK
      </text>
      <text
        x="36"
        y="41"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="10.5"
        fontWeight="700"
        fill="currentColor"
        stroke="none"
        textLength="23"
        lengthAdjust="spacingAndGlyphs"
      >
        YOU
      </text>
    </svg>
  )
}

/** Barra de texto dentro de uma caixa com a altura da linha final. */
function Line({ className, bar }: { className?: string; bar?: string }) {
  return (
    <div className={cn('flex items-center', className)}>
      <Skeleton className={cn('h-[65%] w-full rounded-sm', bar)} />
    </div>
  )
}

/**
 * Pedido em carregamento: o status só chega com a API, então o skeleton tem o formato do recibo
 * (o caso mais comum ao abrir/recarregar um pedido): mesma caixa, mesmas faixas e alturas.
 * Rótulos fixos aparecem; valores, itens e o texto da rede viram barras. Mostra 1 item.
 */
function ReceiptSkeleton() {
  return (
    <div className="relative w-full max-w-[578px] bg-card wide:max-w-[calc(578*var(--u))]" aria-hidden="true">
      <div className="px-6 pb-[18px] pt-[19px] text-center">
        <Skeleton className="mx-auto h-[86px] w-[72px] rounded-lg" />
        <Line className="mt-[9px] h-6" bar="mx-auto w-[300px] max-w-full" />
      </div>
      <dl className="flex justify-center divide-x divide-primary border-y border-primary pb-[16px] pt-[13px] text-[14px] leading-[18px] text-[#cfb28c] max-md:grid max-md:grid-cols-2 max-md:gap-y-3 max-md:divide-x-0 max-md:px-6">
        {[
          ['ID da transação', 'w-[120px]'],
          ['Data', 'w-[100px]'],
          ['Total', 'w-[80px]'],
          ['Carteira', 'w-[80px]'],
        ].map(([label, w]) => (
          <div key={label} className="px-[18px] first:pl-0 last:pr-0 max-md:px-0 wide:px-[calc(18*var(--u))] wide:first:pl-0 wide:last:pr-0">
            <dt className="font-bold">{label}</dt>
            <dd className="text-[15px]">
              <Line className="h-[18px]" bar={w} />
            </dd>
          </div>
        ))}
      </dl>
      <div className="px-[44px] pb-[48px] pt-[17px] max-md:px-5 max-md:pb-8 wide:px-[calc(44*var(--u))]">
        <p className="text-[15px] font-bold leading-5">Detalhes da transação</p>
        <table className="mt-2 w-full table-fixed">
          <colgroup>
            <col />
            <col className="w-[56px] md:w-[92px] wide:w-[calc(92*var(--u))]" />
            <col className="w-[96px] md:w-[113px] wide:w-[calc(113*var(--u))]" />
          </colgroup>
          <thead>
            <tr className="border-b border-[#503320] text-left text-[16px] leading-5 tracking-[-0.4px]">
              <th className="pb-[10px] font-medium">NFTs</th>
              <th className="pb-[10px] text-center font-medium">Edições</th>
              <th className="pb-[10px] text-right font-medium">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-2 pt-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="size-12 shrink-0 rounded-[4px] md:size-[66px] wide:size-[calc(66*var(--u))]" />
                  <div className="min-w-0 flex-1">
                    <Line className="h-[22px]" bar="w-[150px] max-w-full" />
                    <Line className="h-[22px]" bar="w-[100px] max-w-full" />
                  </div>
                </div>
              </td>
              <td className="py-2 pt-3">
                <Line className="h-5" bar="mx-auto w-9" />
              </td>
              <td className="py-2 pt-3">
                <Line className="h-6 md:h-[27px]" bar="ml-auto w-[80px]" />
              </td>
            </tr>
          </tbody>
        </table>
        <dl className="ml-auto mt-[3px] w-full md:w-[321px] wide:w-[calc(321*var(--u))]">
          {['Taxa de rede', 'Total'].map((label) => (
            <div key={label} className={cn('flex h-[30px] items-center justify-between', label === 'Total' && 'font-bold')}>
              <dt className="text-[15px]">{label}</dt>
              <dd>
                <Skeleton className="h-[15px] w-[90px] rounded-sm" />
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-[4px] border-t border-[#503320] pt-[12px]">
          <div className="mx-auto max-w-[470px] wide:max-w-[calc(470*var(--u))]">
            <Line className="h-[22px]" />
            <Line className="h-[22px]" bar="mx-auto w-3/4" />
            <Line className="h-[22px]" bar="mx-auto w-1/2" />
          </div>
        </div>
        <div className="mt-[20px] flex justify-center">
          <Skeleton className="h-12 w-[186px] rounded-[4px]" />
        </div>
      </div>
      <div className="h-[10px] bg-primary" />
    </div>
  )
}

function Receipt({ order }: { order: Order }) {
  const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`.toUpperCase().replace('0X', '0x')
  return (
    // Telas largas: o recibo é ampliado como o resto da página (caixa, colunas e miniaturas); textos no mesmo tamanho.
    <section className="relative w-full max-w-[578px] bg-card wide:max-w-[calc(578*var(--u))]" aria-labelledby="receipt-title" data-testid="receipt">
      <Link to="/" className="absolute right-[6px] top-[10px] grid size-8 place-items-center rounded text-primary hover:bg-secondary" aria-label="Fechar e voltar ao início">
        <X className="size-[22px]" strokeWidth={1.5} aria-hidden="true" />
      </Link>
      <div className="px-6 pb-[18px] pt-[19px] text-center">
        <ThankYouIcon />
        <h1 id="receipt-title" className="mt-[9px] text-[16px] font-semibold leading-6 tracking-[-0.4px] text-[#cfb28c]">
          Seus NFTs agora estão na sua carteira
        </h1>
      </div>

      {/* Mobile (sem frame no Figma): os quatro dados em grade 2x2 para caber em 390px. */}
      <dl className="flex justify-center divide-x divide-primary border-y border-primary pb-[16px] pt-[13px] text-[14px] leading-[18px] text-[#cfb28c] max-md:grid max-md:grid-cols-2 max-md:gap-y-3 max-md:divide-x-0 max-md:px-6">
        <div className="px-[18px] first:pl-0 last:pr-0 max-md:px-0 wide:px-[calc(18*var(--u))] wide:first:pl-0 wide:last:pr-0">
          <dt className="font-bold">ID da transação</dt>
          <dd className="flex items-center gap-1 text-[15px]" data-testid="tx-hash">
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
        <div className="px-[18px] first:pl-0 last:pr-0 max-md:px-0 wide:px-[calc(18*var(--u))] wide:first:pl-0 wide:last:pr-0">
          <dt className="font-bold">Data</dt>
          <dd className="text-[15px]">{receiptDate(order.updatedAt)}</dd>
        </div>
        <div className="px-[18px] first:pl-0 last:pr-0 max-md:px-0 wide:px-[calc(18*var(--u))] wide:first:pl-0 wide:last:pr-0">
          <dt className="font-bold">Total</dt>
          <dd className="text-[15px]">{formatEth(order.total)}</dd>
        </div>
        <div className="px-[18px] first:pl-0 last:pr-0 max-md:px-0 wide:px-[calc(18*var(--u))] wide:first:pl-0 wide:last:pr-0">
          <dt className="font-bold">Carteira</dt>
          <dd className="text-[15px]">{PROVIDER_LABEL[order.wallet.provider]}</dd>
        </div>
      </dl>

      <div className="px-[44px] pb-[48px] pt-[17px] max-md:px-5 max-md:pb-8 wide:px-[calc(44*var(--u))]">
        <h2 className="text-[15px] font-bold leading-5">Detalhes da transação</h2>
        <table className="mt-2 w-full table-fixed">
          <caption className="sr-only">Itens do pedido {order.number}</caption>
          <colgroup>
            <col />
            <col className="w-[56px] md:w-[92px] wide:w-[calc(92*var(--u))]" />
            <col className="w-[96px] md:w-[113px] wide:w-[calc(113*var(--u))]" />
          </colgroup>
          <thead>
            <tr className="border-b border-[#503320] text-left text-[16px] leading-5 tracking-[-0.4px]">
              <th scope="col" className="pb-[10px] font-medium">
                NFTs
              </th>
              <th scope="col" className="pb-[10px] text-center font-medium">
                Edições
              </th>
              <th scope="col" className="pb-[10px] text-right font-medium">
                Subtotal
              </th>
            </tr>
          </thead>
          <tbody className="[&>tr:first-child>td]:pt-3">
            {order.lines.map((l) => (
              <tr key={`${l.nftId}-${l.editionId}`} data-testid="receipt-line">
                <td className="py-2">
                  <div className="flex items-center gap-3">
                    <img {...artSources(l.image, ART_SIZES.receiptRow)} alt="" width={66} height={66} className="size-12 shrink-0 rounded-[4px] object-cover md:size-[66px] wide:size-[calc(66*var(--u))]" />
                    <div className="min-w-0 leading-[22px]">
                      <p className="truncate text-[14px] font-semibold tracking-[-0.4px] md:text-[16px]">{l.name}</p>
                      <p className="text-[13px] text-[#b09161] md:text-[14px]">Edição: {l.editionName}</p>
                    </div>
                  </div>
                </td>
                <td className="py-2 text-center text-[13.5px] text-[#cfb28c]">(x {l.quantity})</td>
                <td className="py-2 text-right text-[16px] font-bold tracking-[-0.3px] text-[#e89b55] md:text-[18px]">{formatEth(l.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="ml-auto mt-[3px] w-full md:w-[321px] wide:w-[calc(321*var(--u))] [&_dd]:tracking-[-0.3px]">
          {order.discount !== '0' && (
            <div className="flex h-[30px] items-center justify-between">
              <dt className="text-[15px]">Desconto</dt>
              <dd className="text-[18px]">(-) {formatEth(order.discount)}</dd>
            </div>
          )}
          <div className="flex h-[30px] items-center justify-between">
            <dt className="text-[15px]">Taxa de rede</dt>
            <dd className="text-[18px]">{formatEth(order.networkFee)}</dd>
          </div>
          <div className="flex h-[30px] items-center justify-between font-bold">
            <dt className="text-[15px]">Total</dt>
            <dd className="text-[18px] text-[#e89b55]" data-testid="receipt-total">
              {formatEth(order.total)}
            </dd>
          </div>
        </dl>
        <p className="mt-[4px] border-t border-[#503320] pt-[12px] text-center text-[14px] leading-[22px] text-[#cbae89]">
          <span className="mx-auto block max-w-[470px] wide:max-w-[calc(470*var(--u))]">Transação confirmada na {NETWORK_LABEL[order.network]}. A propriedade foi transferida para sua carteira conectada e registrada na rede.</span>
        </p>
        {order.explorerUrl && (
          <div className="mt-[20px] text-center">
            <a
              href={order.explorerUrl}
              target="_blank"
              rel="noreferrer"
              title={`Pedido ${order.number}. Referência e link de exploração simulados.`}
              className="inline-flex h-12 min-w-[186px] items-center justify-center rounded-[4px] bg-primary px-4 text-[16px] font-bold tracking-[-0.4px] text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              Ver no {EXPLORER_LABEL[order.network]}
              <span className="sr-only"> (simulado, pedido {order.number}) — abre em nova aba</span>
            </a>
          </div>
        )}
      </div>
      <div className="h-[10px] bg-primary" aria-hidden="true" />
    </section>
  )
}
