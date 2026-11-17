import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { AlertTriangle, ChevronLeft, Trash2 } from 'lucide-react'
import type { Cart, CartItem } from '@/api/contracts'
import { nftListQuery } from '@/api/queries'
import { EmptyState, ErrorState } from '@/components/shared/error-state'
import { QuantityStepper } from '@/components/shared/quantity-stepper'
import { Button, buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useSession } from '@/features/auth/use-session'
import { NftCard } from '@/features/catalog/nft-card'
import { formatEth } from '@/lib/eth'
import { cn } from '@/lib/utils'
import { CouponForm, SummaryLines, SummarySkeleton } from './cart-summary'
import { useAcknowledgePrices, useCart, useRemoveCartItem, useUpdateCartItem } from './hooks'

export function CartPage() {
  const cart = useCart()
  const router = useRouter()

  return (
    <div className="container-page pt-4 md:pt-6">
      <div className="mb-4 flex items-center gap-3 md:hidden">
        <button type="button" onClick={() => router.history.back()} className="grid size-9 place-items-center rounded-full bg-card" aria-label="Voltar">
          <ChevronLeft className="size-5 text-primary" aria-hidden="true" />
        </button>
        <h1 className="flex-1 text-center text-xl font-bold">Carrinho de NFTs</h1>
        <span className="size-9" />
      </div>
      <nav aria-label="Trilha de navegação" className="mb-2 hidden text-[13px] font-semibold md:block">
        <ol className="flex gap-1.5">
          <li><Link to="/" className="hover:text-primary">Início</Link></li>
          <li aria-hidden="true">/</li>
          <li><Link to="/" hash="catalogo" className="hover:text-primary">Mercado</Link></li>
          <li aria-hidden="true">/</li>
          <li aria-current="page">Carrinho</li>
        </ol>
      </nav>
      <h1 className="sr-only md:not-sr-only md:mb-4 md:text-lg md:font-bold">Carrinho de NFTs</h1>

      {cart.isError && !cart.data ? (
        <ErrorState title="Não foi possível carregar o carrinho" message={cart.error.message} onRetry={() => void cart.refetch()} retrying={cart.isFetching} />
      ) : cart.isPending ? (
        <CartLayout list={<ListSkeleton />} summary={<SummarySkeleton />} busy />
      ) : cart.data.items.length === 0 ? (
        <EmptyState
          title="Seu carrinho está vazio"
          message="Explore o catálogo e adicione NFTs para continuar."
          action={
            <Link to="/" hash="catalogo" className={buttonVariants()}>
              Explorar NFTs
            </Link>
          }
        />
      ) : (
        <CartLayout list={<CartItems cart={cart.data} />} summary={<CartSummaryPanel cart={cart.data} />} />
      )}

      <AlsoViewed />
    </div>
  )
}

function CartLayout({ list, summary, busy }: { list: React.ReactNode; summary: React.ReactNode; busy?: boolean }) {
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px] lg:gap-12" aria-busy={busy}>
      <section aria-label="Itens do carrinho">{list}</section>
      <aside aria-labelledby="resumo-title" className="rounded-2xl bg-card p-4 lg:rounded-none lg:bg-transparent lg:p-0">
        <h2 id="resumo-title" className="mb-4 hidden border-b border-border pb-2 text-[15px] font-semibold lg:block">
          Resumo da carteira
        </h2>
        {summary}
      </aside>
    </div>
  )
}

function ListSkeleton() {
  return (
    <ul className="space-y-3" aria-hidden="true">
      {Array.from({ length: 3 }, (_, i) => (
        <li key={i} className="flex items-center gap-4 rounded-md bg-card p-2">
          <Skeleton className="size-16 shrink-0 md:size-12" />
          <Skeleton className="h-5 flex-1" />
          <Skeleton className="h-5 w-20" />
        </li>
      ))}
    </ul>
  )
}

function issueText(item: CartItem) {
  switch (item.issue) {
    case 'price_changed':
      return `Preço alterado de ${formatEth(item.priceWhenAdded)} para ${formatEth(item.unitPrice)}`
    case 'insufficient_stock':
      return `Só restam ${Math.min(item.available, item.maxPerOrder)} unidade(s) disponíveis`
    case 'sold_out':
      return 'Edição esgotada: não entra no total'
    default:
      return null
  }
}

function CartItems({ cart }: { cart: Cart }) {
  const update = useUpdateCartItem()
  const remove = useRemoveCartItem()
  const ack = useAcknowledgePrices()
  const changed = cart.items.filter((i) => i.issue === 'price_changed')

  return (
    <>
      {changed.length > 0 && (
        <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning/60 bg-warning/10 p-3 text-[13px]" data-testid="price-change-alert">
          <p className="flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden="true" />
            {changed.length === 1 ? `O preço de ${changed[0].name} mudou.` : `${changed.length} itens mudaram de preço.`} O resumo já mostra os valores atuais.
          </p>
          <Button size="sm" variant="outline" onClick={() => ack.mutate()} disabled={ack.isPending}>
            Entendi os novos preços
          </Button>
        </div>
      )}

      {/* Desktop: tabela (Figma) */}
      <table className="hidden w-full border-separate border-spacing-y-2 text-[13px] md:table">
        <thead>
          <tr className="text-left text-[14px]">
            <th scope="col" className="border-b border-border pb-2 font-semibold">NFTs</th>
            <th scope="col" className="border-b border-border pb-2 font-semibold">Preço</th>
            <th scope="col" className="border-b border-border pb-2 font-semibold">Edições</th>
            <th scope="col" className="border-b border-border pb-2 font-semibold">Total</th>
            <th scope="col" className="border-b border-border pb-2"><span className="sr-only">Remover</span></th>
          </tr>
        </thead>
        <tbody>
          {cart.items.map((item) => (
            <tr key={item.id} className="bg-card" data-testid="cart-item" data-item-nft={item.nftId}>
              <td className="rounded-l-md p-0">
                <div className="flex items-center gap-3">
                  <img src={item.image} alt="" width={48} height={48} className="size-12 rounded-sm object-cover" />
                  <div>
                    <Link to="/nft/$nftId" params={{ nftId: item.nftId }} search={{ edicao: item.editionId }} className="font-bold hover:text-primary">
                      {item.name}
                    </Link>
                    <p className="text-[12px] text-muted-foreground">Edição: {item.editionName}</p>
                    {item.issue && (
                      <p className={cn('mt-0.5 text-[12px]', item.issue === 'price_changed' ? 'text-warning' : 'text-destructive')} data-testid="item-issue">
                        ⚠ {issueText(item)}
                      </p>
                    )}
                  </div>
                </div>
              </td>
              <td className="font-bold text-primary" data-testid="item-unit-price">{formatEth(item.unitPrice)}</td>
              <td>
                <QuantityStepper
                  value={item.quantity}
                  max={Math.max(item.quantity, Math.min(item.available, item.maxPerOrder))}
                  onChange={(q) => update.mutate({ itemId: item.id, quantity: q })}
                  label={`Quantidade de ${item.name}`}
                  disabled={update.isPending || item.issue === 'sold_out'}
                />
              </td>
              <td className="font-bold text-primary" data-testid="item-line-total">{formatEth(item.lineTotal)}</td>
              <td className="rounded-r-md pr-3 text-right">
                <button type="button" onClick={() => remove.mutate({ itemId: item.id, name: item.name })} disabled={remove.isPending} className="grid size-8 place-items-center rounded hover:bg-secondary" aria-label={`Remover ${item.name} do carrinho`}>
                  <Trash2 className="size-4 text-primary" aria-hidden="true" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile: cartões (Figma) */}
      <ul className="space-y-3 md:hidden">
        {cart.items.map((item) => (
          <li key={item.id} className="flex gap-3 overflow-hidden rounded-xl bg-card" data-testid="cart-item-mobile">
            <img src={item.image} alt="" width={80} height={80} className="size-20 shrink-0 object-cover" />
            <div className="flex flex-1 items-center gap-2 py-2 pr-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-bold">{item.name}</p>
                <p className="text-[12px] text-muted-foreground">Edição: {item.editionName}</p>
                <p className="mt-1 font-bold text-primary">{formatEth(item.lineTotal)}</p>
                {item.issue && <p className="text-[11px] text-warning">⚠ {issueText(item)}</p>}
              </div>
              <div className="flex flex-col items-end gap-2">
                <QuantityStepper
                  value={item.quantity}
                  max={Math.max(item.quantity, Math.min(item.available, item.maxPerOrder))}
                  onChange={(q) => update.mutate({ itemId: item.id, quantity: q })}
                  label={`Quantidade de ${item.name}`}
                  disabled={update.isPending || item.issue === 'sold_out'}
                />
                <button type="button" onClick={() => remove.mutate({ itemId: item.id, name: item.name })} className="text-[12px] text-primary underline-offset-2 hover:underline" aria-label={`Remover ${item.name} do carrinho`}>
                  Remover
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}

function CartSummaryPanel({ cart }: { cart: Cart }) {
  const navigate = useNavigate()
  const { user } = useSession()
  const blocking = cart.items.filter((i) => i.issue === 'sold_out' || i.issue === 'insufficient_stock')
  return (
    <div className="space-y-5">
      <CouponForm cart={cart} />
      <SummaryLines summary={cart.summary} coupon={cart.coupon} />
      {blocking.length > 0 && (
        <p role="status" className="text-[12px] text-destructive">
          Ajuste ou remova os itens marcados para continuar.
        </p>
      )}
      <Button
        className="h-11 w-full rounded-md font-semibold max-lg:rounded-full"
        disabled={blocking.length > 0}
        onClick={() => void navigate(user ? { to: '/pagamento' } : { to: '/login', search: { redirect: '/pagamento' } })}
        data-testid="checkout-button"
      >
        Conectar e finalizar
      </Button>
      <Link to="/" hash="catalogo" className="block text-center text-[13px] text-primary hover:underline">
        Continuar explorando
      </Link>
    </div>
  )
}

function AlsoViewed() {
  const { data } = useQuery(nftListQuery({ sort: 'popular', page: 1, pageSize: 5 }))
  if (!data?.items.length) return null
  return (
    <section aria-labelledby="tambem-viram" className="mt-14 hidden md:block">
      <h2 id="tambem-viram" className="mb-4 border-b border-border pb-2 text-[14px] font-semibold text-primary">
        Colecionadores também viram
      </h2>
      <ul className="grid grid-cols-3 gap-4 lg:grid-cols-5">
        {data.items.map((n) => (
          <li key={n.id}>
            <NftCard nft={n} />
          </li>
        ))}
      </ul>
    </section>
  )
}
