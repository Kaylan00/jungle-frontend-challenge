import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { AlertTriangle, ChevronLeft } from 'lucide-react'
import { useState } from 'react'
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
import { VitrineCardSkeleton, VitrineDotsSkeleton } from '@/features/nft/vitrine-skeleton'
import { CouponForm, CouponSkeleton, SummaryLines } from './cart-summary'
import { useAcknowledgePrices, useCart, useRemoveCartItem, useUpdateCartItem } from './hooks'

export function CartPage() {
  const cart = useCart()
  const router = useRouter()

  return (
    // Mobile (Figma 414): margens de 28px, resumo num painel que vai até o fim da tela.
    <div className="container-page pt-4 max-md:flex max-md:min-h-dvh max-md:flex-col max-md:px-7 max-md:pt-8 md:pt-7 xl:pb-4 xl:pt-8">
      <div className="mb-[21px] flex items-center md:hidden">
        <button
          type="button"
          onClick={() => router.history.back()}
          className="grid size-[35px] shrink-0 place-items-center rounded-full border border-[#3c2218] bg-[#2f1d15] text-[#b09261] transition-colors hover:text-highlight"
          aria-label="Voltar"
        >
          <ChevronLeft className="size-5" strokeWidth={1.75} aria-hidden="true" />
        </button>
        <h1 className="flex-1 pl-[25px] text-center text-[20px] font-bold leading-7">Carrinho de NFTs</h1>
        <span className="size-[35px] shrink-0" />
      </div>
      <nav aria-label="Trilha de navegação" className="hidden text-[15px] font-bold leading-6 md:block xl:leading-4">
        <ol className="flex gap-[9px]">
          <li>
            <Link to="/" className="hover:text-primary">
              Início
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link to="/" hash="catalogo" className="hover:text-primary">
              Mercado
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page">Carrinho</li>
        </ol>
      </nav>
      <h1 className="sr-only">Carrinho de NFTs</h1>

      {cart.isError && !cart.data ? (
        <ErrorState title="Não foi possível carregar o carrinho" message={cart.error.message} onRetry={() => void cart.refetch()} retrying={cart.isFetching} />
      ) : cart.isPending ? (
        <CartLayout list={<ListSkeleton />} summary={<SummaryPanelSkeleton />} busy />
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
    <div className="grid gap-8 max-md:flex max-md:flex-1 max-md:flex-col max-md:gap-1 md:mt-[4px] lg:grid-cols-[minmax(0,1fr)_332px] lg:gap-12 xl:mt-[11px] xl:gap-[86px]" aria-busy={busy}>
      <section aria-label="Itens do carrinho">{list}</section>
      <aside
        aria-labelledby="resumo-title"
        className="rounded-2xl bg-card p-4 max-md:-mx-7 max-md:mt-auto max-md:rounded-b-none max-md:rounded-t-[30px] max-md:px-6 max-md:pb-8 max-md:pt-6 lg:rounded-none lg:bg-transparent lg:p-0"
      >
        <h2 id="resumo-title" className="mb-6 hidden border-b border-[#442c1b] pb-3 text-[18px] font-bold leading-4 lg:block">
          Resumo da carteira
        </h2>
        {summary}
      </aside>
    </div>
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
 * Itens em carregamento: no desktop a mesma tabela (cabeçalho e linhas de 70px com 12px entre elas),
 * no celular os mesmos cartões de 100px. Mostra 2 itens (a quantidade real só chega com o carrinho).
 */
function ListSkeleton() {
  const rows = [0, 1]
  return (
    <div aria-hidden="true">
      <p className="sr-only">Carregando itens do carrinho…</p>
      <table className="-mt-3 hidden w-full table-fixed border-separate border-spacing-x-0 border-spacing-y-3 text-[15px] md:table">
        <colgroup>
          <col className="w-[39.9%]" />
          <col className="w-[17.65%]" />
          <col className="w-[17.4%]" />
          <col className="w-[19.3%]" />
          <col />
        </colgroup>
        <thead>
          <tr className="text-left leading-6 xl:text-[16px] xl:leading-4">
            {['NFTs', 'Preço', 'Edições', 'Total', ''].map((h) => (
              <th key={h} scope="col" className="border-b border-[#442c1b] pb-[7px] font-medium xl:pb-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <tr key={i} className="bg-[#241612]">
              <td className="h-[70px] p-0">
                <div className="flex items-center gap-[17px]">
                  <Skeleton className="size-[70px] shrink-0 rounded-[4px]" />
                  <div className="min-w-0 flex-1">
                    <Line className="h-[22px] xl:h-4" bar="w-[150px]" />
                    <Line className="h-5 xl:mt-1.5 xl:h-4" bar="w-[100px]" />
                  </div>
                </div>
              </td>
              <td>
                <Line className="h-6" bar="w-[72px]" />
              </td>
              <td>
                <Skeleton className="h-7 w-[74px] rounded-full" />
              </td>
              <td>
                <Line className="h-6" bar="w-[80px]" />
              </td>
              <td className="p-0">
                <Skeleton className="-ml-[7px] size-8 rounded" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="space-y-5 md:hidden">
        {rows.map((i) => (
          <li key={i} className="relative flex min-h-[100px] overflow-hidden rounded-[12px] bg-card">
            <Skeleton className="w-[100px] shrink-0 self-stretch rounded-none" />
            <div className="min-w-0 flex-1 pb-2 pl-[10px] pr-4 pt-3">
              <Line className="h-5" bar="w-[130px]" />
              <Line className="mt-px h-5" bar="w-[90px]" />
              <Line className="mt-3 h-6" bar="w-[80px]" />
            </div>
            <Skeleton className="absolute right-4 top-[38px] h-6 w-[73px] rounded-full" />
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Resumo em carregamento: mesmo cupom, linhas de valores (rótulos reais), botão e link do resumo carregado. */
function SummaryPanelSkeleton() {
  return (
    <div className="space-y-5 max-md:space-y-0 lg:space-y-0">
      <CouponSkeleton variant="cart" />
      <SummaryLines summary={null} coupon={null} variant="cart" className="max-md:!mt-[9px] lg:!mt-6" />
      <Skeleton className="h-11 w-full rounded-full max-md:!mt-7 max-md:h-[60px] lg:!mt-6 lg:h-10 lg:rounded-[3px]" />
      <Line className="h-[19.5px] max-md:hidden lg:!mt-3 lg:h-5" bar="mx-auto w-[170px]" />
    </div>
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
      <table className="-mt-3 hidden w-full table-fixed border-separate border-spacing-x-0 border-spacing-y-3 text-[15px] md:table">
        <colgroup>
          <col className="w-[39.9%]" />
          <col className="w-[17.65%]" />
          <col className="w-[17.4%]" />
          <col className="w-[19.3%]" />
          <col />
        </colgroup>
        <thead>
          <tr className="text-left leading-6 xl:text-[16px] xl:leading-4">
            <th scope="col" className="border-b border-[#442c1b] pb-[7px] font-medium xl:pb-3">
              NFTs
            </th>
            <th scope="col" className="border-b border-[#442c1b] pb-[7px] font-medium xl:pb-3">
              Preço
            </th>
            <th scope="col" className="border-b border-[#442c1b] pb-[7px] font-medium xl:pb-3">
              Edições
            </th>
            <th scope="col" className="border-b border-[#442c1b] pb-[7px] font-medium xl:pb-3">
              Total
            </th>
            <th scope="col" className="border-b border-[#442c1b] pb-[7px] xl:pb-3">
              <span className="sr-only">Remover</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {cart.items.map((item) => (
            <tr key={item.id} className="bg-[#241612]" data-testid="cart-item" data-item-nft={item.nftId}>
              <td className="h-[70px] p-0">
                <div className="flex items-center gap-[17px]">
                  <img src={item.image} alt="" width={70} height={70} className="size-[70px] shrink-0 rounded-[4px] object-cover" />
                  <div className="min-w-0">
                    <Link
                      to="/nft/$nftId"
                      params={{ nftId: item.nftId }}
                      search={{ edicao: item.editionId }}
                      className="block truncate text-[15px] font-bold leading-[22px] tracking-[0.5px] hover:text-primary xl:text-[16px] xl:leading-4 xl:tracking-normal"
                    >
                      {item.name}
                    </Link>
                    <p className="text-[13px] leading-5 tracking-[0.3px] text-[#ae8f60] xl:mt-1.5 xl:text-[14px] xl:leading-4 xl:tracking-normal xl:text-[#b39463]">Edição: {item.editionName}</p>
                    {item.issue && (
                      <p className={cn('mt-0.5 text-[12px]', item.issue === 'price_changed' ? 'text-warning' : 'text-destructive')} data-testid="item-issue">
                        ⚠ {issueText(item)}
                      </p>
                    )}
                  </div>
                </div>
              </td>
              <td className="font-semibold tracking-[0.6px] text-[#cfb28c] xl:text-[16px] xl:tracking-normal" data-testid="item-unit-price">
                {formatEth(item.unitPrice)}
              </td>
              <td>
                <QuantityStepper
                  value={item.quantity}
                  max={Math.max(item.quantity, Math.min(item.available, item.maxPerOrder))}
                  onChange={(q) => update.mutate({ itemId: item.id, quantity: q })}
                  label={`Quantidade de ${item.name}`}
                  disabled={update.isPending || item.issue === 'sold_out'}
                />
              </td>
              <td className="font-bold tracking-[0.6px] text-[#e89b55] xl:text-[16px] xl:tracking-normal" data-testid="item-line-total">
                {formatEth(item.lineTotal)}
              </td>
              <td className="p-0">
                <button
                  type="button"
                  onClick={() => remove.mutate({ itemId: item.id, name: item.name })}
                  disabled={remove.isPending}
                  className="-ml-[7px] grid size-8 place-items-center rounded hover:bg-secondary"
                  aria-label={`Remover ${item.name} do carrinho`}
                >
                  <TrashIcon />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile: cartões de 100px com a arte à esquerda e o seletor de quantidade à direita (Figma 414) */}
      <ul className="space-y-5 md:hidden">
        {cart.items.map((item) => (
          <li key={item.id} className="relative flex min-h-[100px] overflow-hidden rounded-[12px] bg-card" data-testid="cart-item-mobile">
            <img src={item.image} alt="" width={100} height={100} className="w-[100px] shrink-0 self-stretch object-cover" />
            <div className="min-w-0 flex-1 pb-2 pl-[10px] pr-4 pt-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold leading-5">{item.name}</p>
                <p className="mt-px text-[14px] leading-5 text-muted-foreground">Edição: {item.editionName}</p>
                <p className="mt-3 text-[18px] font-bold leading-6 text-highlight">{formatEth(item.lineTotal)}</p>
                {item.issue && <p className="text-[11px] text-warning">⚠ {issueText(item)}</p>}
              </div>
              <QuantityStepper
                value={item.quantity}
                max={Math.max(item.quantity, Math.min(item.available, item.maxPerOrder))}
                onChange={(q) => update.mutate({ itemId: item.id, quantity: q })}
                label={`Quantidade de ${item.name}`}
                disabled={update.isPending || item.issue === 'sold_out'}
                className="absolute right-4 top-[38px]"
              />
            </div>
            {/* Remover: lixeira discreta no canto (o Figma mostra a lixeira junto do seletor). */}
            <button
              type="button"
              onClick={() => remove.mutate({ itemId: item.id, name: item.name })}
              className="absolute bottom-1.5 right-3 grid size-7 place-items-center rounded text-[#b39463] hover:text-highlight"
              aria-label={`Remover ${item.name} do carrinho`}
            >
              <TrashIcon className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

/** Lixeira do Figma (contorno simples, sem as linhas internas do ícone do Lucide). */
function TrashIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={cn('size-[22px] text-[#b39463]', className)} aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

function CartSummaryPanel({ cart }: { cart: Cart }) {
  const navigate = useNavigate()
  const { user } = useSession()
  const blocking = cart.items.filter((i) => i.issue === 'sold_out' || i.issue === 'insufficient_stock')
  return (
    <div className="space-y-5 max-md:space-y-0 lg:space-y-0">
      <CouponForm cart={cart} variant="cart" />
      <SummaryLines summary={cart.summary} coupon={cart.coupon} variant="cart" className="max-md:!mt-[9px] lg:!mt-6" />
      {blocking.length > 0 && (
        <p role="status" className="text-[12px] text-destructive max-md:mt-3 lg:!mt-3">
          Ajuste ou remova os itens marcados para continuar.
        </p>
      )}
      <Button
        className="h-11 w-full rounded-md font-semibold max-lg:rounded-full max-md:!mt-7 max-md:h-[60px] max-md:bg-[linear-gradient(90deg,#d08a4c,#b77842)] max-md:text-[16px] max-md:font-bold max-md:hover:brightness-110 lg:!mt-6 lg:h-10 lg:rounded-[3px] lg:text-[15px] lg:font-bold lg:leading-4"
        disabled={blocking.length > 0}
        onClick={() => void navigate(user ? { to: '/pagamento' } : { to: '/login', search: { redirect: '/pagamento' } })}
        data-testid="checkout-button"
      >
        Conectar e finalizar
      </Button>
      <Link to="/" hash="catalogo" className="block text-center text-[13px] text-primary hover:underline max-md:hidden lg:!mt-3 lg:text-[15px] lg:leading-5 lg:text-[#e89b55]">
        Continuar explorando
      </Link>
    </div>
  )
}

const PER_PAGE = 5

function AlsoViewed() {
  const { data, isPending } = useQuery(nftListQuery({ sort: 'popular', page: 1, pageSize: PER_PAGE * 3 }))
  const [page, setPage] = useState(0)
  const items = data?.items ?? []
  if (isPending) return <AlsoViewedSkeleton />
  if (!items.length) return null
  const pages = Math.ceil(items.length / PER_PAGE)
  const current = Math.min(page, pages - 1)
  return (
    <section aria-labelledby="tambem-viram" className="mt-14 hidden md:block lg:mt-24">
      <h2 id="tambem-viram" className="mb-4 border-b border-border pb-2 text-[14px] font-semibold text-primary lg:mb-8 lg:border-[#442c1b] lg:pb-[11px] lg:text-[17px] lg:font-bold lg:leading-4 lg:text-[#e89b55]">
        Colecionadores também viram
      </h2>
      <ul className="grid grid-cols-3 gap-4 lg:grid-cols-5 lg:gap-[26px]" aria-live="polite" data-reveal-group>
        {items.slice(current * PER_PAGE, current * PER_PAGE + PER_PAGE).map((n) => (
          <li key={n.id}>
            <NftCard nft={n} variant="cart" />
          </li>
        ))}
      </ul>
      {pages > 1 && (
        <div className="mt-[30px] flex justify-center gap-2 xl:mt-8" role="group" aria-label="Páginas de sugestões">
          {Array.from({ length: pages }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setPage(i)}
              aria-label={`Página ${i + 1} de ${pages}`}
              aria-current={i === current ? 'true' : undefined}
              className={cn('size-3 rounded-full border border-primary transition-colors hover:bg-primary/60 xl:border-[1.3px]', i === current && 'bg-primary')}
            />
          ))}
        </div>
      )}
    </section>
  )
}

/** "Colecionadores também viram" em carregamento: mesmo título, 5 cards e os pontos das 3 páginas. */
function AlsoViewedSkeleton() {
  return (
    <section aria-labelledby="tambem-viram" aria-busy="true" className="mt-14 hidden md:block lg:mt-24">
      <h2 id="tambem-viram" className="mb-4 border-b border-border pb-2 text-[14px] font-semibold text-primary lg:mb-8 lg:border-[#442c1b] lg:pb-[11px] lg:text-[17px] lg:font-bold lg:leading-4 lg:text-[#e89b55]">
        Colecionadores também viram
      </h2>
      <p className="sr-only">Carregando sugestões…</p>
      <ul className="grid grid-cols-3 gap-4 lg:grid-cols-5 lg:gap-[26px]" aria-hidden="true">
        {Array.from({ length: PER_PAGE }, (_, i) => (
          <li key={i}>
            <VitrineCardSkeleton variant="cart" />
          </li>
        ))}
      </ul>
      <VitrineDotsSkeleton className="mt-[30px] xl:mt-8" />
    </section>
  )
}
