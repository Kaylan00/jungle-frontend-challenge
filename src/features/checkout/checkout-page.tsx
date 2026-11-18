/**
 * Pagamento (checkout).
 *
 * Fluxo: dados do colecionador → carteira e rede (conexão simulada) → "Revisar pedido"
 * (a API devolve uma COTAÇÃO com preço, disponibilidade, cupom e taxa) → "Confirmar compra"
 * (pedido idempotente) → página do pedido, que mostra pendente / confirmado / recusado.
 *
 * Proteções:
 *  - Cotação desatualizada: se chegar evento de preço/estoque durante a revisão, o botão de
 *    confirmar trava e pede nova revisão. O servidor também recusa (409 QUOTE_OUTDATED) e
 *    devolve a cotação nova, que a pessoa precisa confirmar de novo.
 *  - Sessão expirada no meio: o formulário fica salvo (rascunho) e é restaurado após o login.
 *  - Duplicidade: ver order-attempt.ts.
 *
 * Organização: este arquivo monta a página. O estado mora em três hooks — use-checkout-form (formulário e
 * rascunho), use-wallet-connection (conexão simulada) e use-order-review (cotação, revisão e envio) — e a
 * interface em collector-profile-section, wallet-network-fieldset, checkout-summary, review-dialog e
 * checkout-skeleton.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ChevronLeft, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { Cart, Wallet } from '@/api/contracts'
import { api } from '@/api/endpoints'
import { ApiError } from '@/api/http'
import { qk, walletsQuery } from '@/api/queries'
import { EmptyState, ErrorState } from '@/components/shared/error-state'
import { Button, buttonVariants } from '@/components/ui/button'
import { useSession } from '@/features/auth/use-session'
import { useCart } from '@/features/cart/hooks'
import { useBottomBar } from '@/lib/bottom-bars'
import { usePageTitle } from '@/lib/page-title'
import { useIsDesktop } from '@/lib/use-media-query'
import { CHECKOUT_GRID, SUBMIT_BAR } from './checkout-model'
import { CheckoutSkeleton } from './checkout-skeleton'
import { CheckoutSummary } from './checkout-summary'
import { CollectorProfileSection } from './collector-profile-section'
import { clearAttempt, loadAttempt, rememberPendingOrder, submitAttempt, type OrderAttempt } from './order-attempt'
import { ReviewDialog } from './review-dialog'
import { useCheckoutForm } from './use-checkout-form'
import { useOrderReview, type OrderReviewApi } from './use-order-review'
import { useWalletConnection } from './use-wallet-connection'
import { WalletNetworkFieldset } from './wallet-network-fieldset'

export function CheckoutPage() {
  const { user } = useSession()
  const cart = useCart()
  const wallets = useQuery(walletsQuery(user!.id))
  const [recovering, setRecovering] = useState(() => (user ? loadAttempt(user.id) : null))
  usePageTitle('Pagamento')

  if (recovering) return <RecoverAttempt attempt={recovering} onGiveUp={() => setRecovering(null)} />

  return (
    <CheckoutFrame>
      <PendingOrdersBanner />
      {cart.isError && !cart.data ? (
        <ErrorState title="Não foi possível carregar o carrinho" message={cart.error.message} onRetry={() => void cart.refetch()} />
      ) : wallets.isError && !wallets.data ? (
        <ErrorState title="Não foi possível carregar suas carteiras" message={wallets.error.message} onRetry={() => void wallets.refetch()} />
      ) : cart.isPending || wallets.isPending ? (
        <CheckoutSkeleton />
      ) : cart.data.items.length === 0 ? (
        <EmptyState
          title="Não há itens para pagar"
          message="Seu carrinho está vazio. Se você acabou de comprar, os itens comprados já saíram do carrinho."
          action={
            <Link to="/" hash="catalogo" className={buttonVariants()}>
              Explorar NFTs
            </Link>
          }
        />
      ) : wallets.data.items.length === 0 ? (
        <EmptyState
          title="Cadastre uma carteira para pagar"
          message="As carteiras cadastradas ficam disponíveis no pagamento."
          action={
            <Link to="/perfil/carteiras" className={buttonVariants()}>
              Cadastrar carteira
            </Link>
          }
        />
      ) : (
        <CheckoutForm cart={cart.data} wallets={wallets.data.items} />
      )}
    </CheckoutFrame>
  )
}

/** Moldura da página de pagamento: trilha (desktop), título com voltar (celular) e o h1. */
function CheckoutFrame({ children }: { children: React.ReactNode }) {
  // Um único h1 na página: o título visível do celular ou, no desktop (sem título visível no Figma), o oculto.
  const isDesktop = useIsDesktop()
  const MobileTitle = isDesktop ? 'p' : 'h1'
  return (
    // Mobile (Figma 414): margens de 28px e espaço no fim para o botão fixo "Confirmar compra".
    <div className="container-page pt-4 max-md:px-7 max-md:pb-[124px] max-md:pt-8 md:pt-7">
      <nav aria-label="Trilha de navegação" className="mb-4 hidden text-[15px] font-bold leading-6 md:block lg:mb-6">
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
          <li aria-current="page">Pagamento</li>
        </ol>
      </nav>
      <div className="mb-5 flex items-center md:hidden">
        <Link
          to="/carrinho"
          className="grid size-[35px] shrink-0 place-items-center rounded-full border border-[#3c2218] bg-[#2f1d15] text-[#b09261] transition-colors hover:text-highlight"
          aria-label="Voltar ao carrinho"
        >
          <ChevronLeft className="size-5" strokeWidth={1.75} aria-hidden="true" />
        </Link>
        <MobileTitle className="flex-1 pl-[25px] text-[20px] font-bold leading-7">Pagamento com carteira</MobileTitle>
      </div>
      {isDesktop && <h1 className="sr-only">Pagamento com carteira</h1>}
      {children}
    </div>
  )
}

/** Enquanto a sessão é conferida (rota privada): a mesma moldura com o skeleton do pagamento. */
export function CheckoutPending() {
  return (
    <CheckoutFrame>
      <CheckoutSkeleton />
    </CheckoutFrame>
  )
}

/** Formulário de pagamento: perfil do colecionador, resumo, carteira e rede, botão final e a revisão. */
function CheckoutForm({ cart, wallets }: { cart: Cart; wallets: Wallet[] }) {
  const checkout = useCheckoutForm(wallets)
  const connection = useWalletConnection(checkout)
  const review = useOrderReview({ cart, checkout, connection })

  return (
    <>
      <form onSubmit={review.review} noValidate className={CHECKOUT_GRID} aria-label="Pagamento" data-testid="checkout-form">
        <CollectorProfileSection checkout={checkout} connection={connection} wallets={wallets} />
        <aside aria-label="Resumo e carteira" className="space-y-5 max-lg:order-1 max-md:flex max-md:flex-col max-md:gap-5 max-md:space-y-0 lg:space-y-0">
          <CheckoutSummary cart={cart} />
          <WalletNetworkFieldset cart={cart} wallets={wallets} checkout={checkout} connection={connection} />
        </aside>
        <SubmitBar quoting={review.quoting} />
      </form>
      <ReviewDialog checkout={checkout} review={review} />
    </>
  )
}

/** "Revisar e confirmar compra": fixo no rodapé do celular (mede a barra para os avisos), na coluna da direita no desktop. */
function SubmitBar({ quoting }: Pick<OrderReviewApi, 'quoting'>) {
  const submitBarRef = useBottomBar()
  return (
    <div ref={submitBarRef} className={SUBMIT_BAR} data-motion-fixed>
      <Button
        type="submit"
        className="h-11 w-full font-semibold max-lg:h-12 max-lg:rounded-full max-md:h-[60px] max-md:bg-[linear-gradient(90deg,#d08a4c,#b77842)] max-md:text-[16px] max-md:font-bold max-md:hover:brightness-110 lg:h-[45px] lg:rounded-[4px] lg:text-[16px] lg:font-bold"
        disabled={quoting}
        data-testid="review-button"
        aria-label={quoting ? undefined : 'Revisar e confirmar compra'}
      >
        {quoting ? (
          'Gerando revisão…'
        ) : (
          <>
            <span className="max-md:hidden">Revisar e confirmar compra</span>
            <span className="md:hidden">Confirmar compra</span>
          </>
        )}
      </Button>
    </div>
  )
}

/** Refresh no meio do envio: reenvia a mesma tentativa (mesma chave) para recuperar o pedido. */
function RecoverAttempt({ attempt, onGiveUp }: { attempt: OrderAttempt; onGiveUp: () => void }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  const run = async () => {
    setError(null)
    try {
      const order = await submitAttempt(attempt)
      clearAttempt()
      rememberPendingOrder(attempt.userId, order.id)
      queryClient.setQueryData(qk.order(attempt.userId, order.id), order)
      void navigate({
        to: '/pedido/$orderId',
        params: { orderId: order.id },
        replace: true,
      })
    } catch (e) {
      const err = e instanceof ApiError ? e : null
      if (err && !err.isTransient) {
        // A tentativa não virou pedido (ex.: cotação venceu): volta ao formulário.
        clearAttempt()
        toast.info('A tentativa anterior não foi concluída. Revise o pedido novamente.')
        onGiveUp()
        return
      }
      setError(err?.message ?? 'Falha ao recuperar o pedido')
    }
  }

  useEffect(() => {
    if (started.current) return
    started.current = true
    void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="container-page py-16" data-testid="recovering-order">
      {error ? (
        <ErrorState title="Não conseguimos confirmar o seu pedido ainda" message={`${error} Tentar de novo não cria outra compra.`} onRetry={() => void run()} />
      ) : (
        <div role="status" className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
          <p className="font-semibold">Recuperando seu pedido…</p>
          <p className="text-[13px] text-muted-foreground">Encontramos uma compra em andamento e estamos conferindo com o servidor, sem criar outra.</p>
        </div>
      )}
    </div>
  )
}

function PendingOrdersBanner() {
  const { user } = useSession()
  const pending = useQuery({
    queryKey: [...qk.orders(user!.id), 'pending'],
    queryFn: ({ signal }) => api.listOrders('pending', { signal }),
  })
  const order = pending.data?.items[0]
  if (!order) return null
  return (
    <div role="status" className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/60 bg-primary/10 p-3 text-[13px]" data-testid="pending-order-banner">
      Você tem um pedido em processamento ({order.number}).
      <Link to="/pedido/$orderId" params={{ orderId: order.id }} className="font-semibold text-primary underline">
        Acompanhar pedido
      </Link>
    </div>
  )
}
