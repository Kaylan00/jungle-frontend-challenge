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
 */
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronLeft, Loader2, MoreVertical, Wallet as WalletIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { CollectorInput, Network, WalletProvider, type Cart, type Quote, type Wallet } from '@/api/contracts'
import { api } from '@/api/endpoints'
import { ApiError } from '@/api/http'
import { qk, walletsQuery } from '@/api/queries'
import { EmptyState, ErrorState } from '@/components/shared/error-state'
import { FormField, RequiredMark } from '@/components/shared/form-field'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useSession } from '@/features/auth/use-session'
import { CouponForm, SummaryLines } from '@/features/cart/cart-summary'
import { useCart } from '@/features/cart/hooks'
import { NETWORK_LABEL } from '@/features/catalog/search-params'
import { announce } from '@/lib/announcer'
import { ART_SIZES, artSources } from '@/lib/art'
import { useBottomBar } from '@/lib/bottom-bars'
import { formatEth } from '@/lib/eth'
import { cn } from '@/lib/utils'
import { clearAttempt, loadAttempt, newIdempotencyKey, rememberPendingOrder, saveAttempt, submitAttempt, type OrderAttempt } from './order-attempt'

const CheckoutForm = CollectorInput.extend({
  network: Network,
  provider: WalletProvider,
  walletId: z.string().min(1, 'Selecione uma carteira'),
})
type CheckoutForm = z.infer<typeof CheckoutForm>

const PROVIDER_LABEL: Record<WalletProvider, string> = {
  walletconnect: 'WalletConnect',
  metamask: 'MetaMask',
  coinbase: 'Coinbase Wallet',
}
/** Ordem dos cartões de tipo de carteira no Figma mobile. */
const PROVIDER_ORDER: WalletProvider[] = ['walletconnect', 'metamask', 'coinbase']
const DRAFT_KEY = 'kurio.checkout.draft'

type Connection = {
  status: 'idle' | 'connecting' | 'connected' | 'rejected'
  walletId?: string
  network?: Network
  message?: string
}

export function CheckoutPage() {
  const { user } = useSession()
  const cart = useCart()
  const wallets = useQuery(walletsQuery(user!.id))
  const [recovering, setRecovering] = useState(() => (user ? loadAttempt(user.id) : null))

  if (recovering) return <RecoverAttempt attempt={recovering} onGiveUp={() => setRecovering(null)} />

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
        <h1 className="flex-1 pl-[25px] text-[20px] font-bold leading-7">Pagamento com carteira</h1>
      </div>
      <h1 className="sr-only max-md:hidden">Pagamento com carteira</h1>
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
        <CheckoutForm_ cart={cart.data} wallets={wallets.data.items} />
      )}
    </div>
  )
}

function CheckoutForm_({ cart, wallets }: { cart: Cart; wallets: Wallet[] }) {
  const { user } = useSession()
  const submitBarRef = useBottomBar()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const primary = wallets.find((w) => w.role === 'primary') ?? wallets[0]

  const defaults: CheckoutForm = (() => {
    try {
      const draft = sessionStorage.getItem(DRAFT_KEY)
      if (draft) return { ...JSON.parse(draft), note: JSON.parse(draft).note ?? '' }
    } catch {
      /* ignore */
    }
    return {
      displayName: primary.displayName,
      username: user!.username,
      profileName: primary.profileName,
      email: primary.email,
      ensName: primary.ensName,
      referralCode: primary.referralCode,
      note: '',
      network: primary.network,
      provider: primary.provider,
      walletId: primary.id,
    }
  })()

  const form = useForm<CheckoutForm>({
    resolver: zodResolver(CheckoutForm),
    defaultValues: defaults,
    mode: 'onTouched',
  })
  const { errors } = form.formState
  const [walletId, network, provider] = useWatch({ control: form.control, name: ['walletId', 'network', 'provider'] })
  const wallet = wallets.find((w) => w.id === walletId)

  // Rascunho: sobrevive a refresh e à expiração da sessão (volta preenchido após o login).
  useEffect(() => {
    return form.subscribe({
      formState: { values: true },
      callback: ({ values }) => {
        try {
          sessionStorage.setItem(DRAFT_KEY, JSON.stringify(values))
        } catch {
          /* ignore */
        }
      },
    })
  }, [form])

  // ---- Conexão simulada da carteira ----
  const [conn, setConn] = useState<Connection>({ status: 'idle' })
  const connected = conn.status === 'connected' && conn.walletId === walletId && conn.network === network

  const connect = async () => {
    if (!wallet) return
    if (wallet.network !== network) {
      form.setError('network', {
        type: 'manual',
        message: `A carteira ${wallet.nickname} opera na rede ${NETWORK_LABEL[wallet.network]}`,
      })
      return
    }
    setConn({ status: 'connecting', walletId, network })
    try {
      await api.connectWallet(wallet.id, network)
      setConn({ status: 'connected', walletId, network })
      announce(`Carteira ${wallet.nickname} conectada na rede ${NETWORK_LABEL[network]}`)
    } catch (e) {
      const message = e instanceof ApiError && e.code === 'WALLET_REJECTED' ? 'Conexão recusada na carteira. Você pode tentar de novo.' : e instanceof ApiError ? e.message : 'Falha ao conectar'
      setConn({ status: 'rejected', walletId, network, message })
      announce(message, 'assertive')
    }
  }

  const disconnect = async () => {
    if (conn.walletId) await api.disconnectWallet(conn.walletId).catch(() => undefined)
    setConn({ status: 'idle' })
    announce('Carteira desconectada')
  }

  const selectWallet = (w: Wallet) => {
    if (conn.status === 'connected') void disconnect()
    form.setValue('walletId', w.id, { shouldValidate: true })
    form.setValue('network', w.network, { shouldValidate: true })
    form.setValue('provider', w.provider)
    form.clearErrors('network')
  }

  // ---- Revisão (cotação) e envio ----
  const [quote, setQuote] = useState<Quote | null>(null)
  // "Assinatura" do carrinho no momento da cotação: preço, estoque e quantidade de cada item.
  const signature = cart.items.map((i) => `${i.editionId}:${i.unitPrice}:${i.available}:${i.quantity}`).join('|')
  const [quoteSignature, setQuoteSignature] = useState<string | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewNotice, setReviewNotice] = useState<string | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [attempt, setAttempt] = useState<OrderAttempt | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const inFlight = useRef(false)

  // Evento em tempo real mudou o carrinho depois da cotação: a revisão fica desatualizada.
  const quoteStale = reviewOpen && quote !== null && quoteSignature !== null && signature !== quoteSignature

  useEffect(() => {
    if (quoteStale) announce('Preço ou disponibilidade mudaram desde a revisão. Atualize a revisão antes de confirmar.', 'assertive')
  }, [quoteStale])

  const requestQuote = async (values: CheckoutForm) => {
    setQuoting(true)
    setSubmitError(null)
    try {
      const q = await api.createQuote({
        network: values.network,
        couponCode: cart.coupon?.code ?? null,
      })
      setQuote(q)
      setQuoteSignature(signature)
      setAttempt({
        userId: user!.id,
        key: newIdempotencyKey(),
        body: {
          quoteId: q.id,
          fingerprint: q.fingerprint,
          walletId: values.walletId,
          network: values.network,
          provider: values.provider,
          collector: CollectorInput.parse(values),
        },
        createdAt: new Date().toISOString(),
      })
      setReviewOpen(true)
    } catch (e) {
      const err = e instanceof ApiError ? e : null
      const msg = err?.code === 'AVAILABILITY_CONFLICT' ? 'Alguns itens não têm mais a quantidade desejada. Ajuste o carrinho.' : (err?.message ?? 'Não foi possível gerar a revisão')
      toast.error(msg)
      announce(msg, 'assertive')
      if (err?.code === 'AVAILABILITY_CONFLICT' || err?.code === 'COUPON_EXPIRED' || err?.code === 'COUPON_INVALID') {
        void queryClient.invalidateQueries({ queryKey: qk.cart(user!.id) })
      }
    } finally {
      setQuoting(false)
    }
  }

  const onReview = form.handleSubmit(async (values) => {
    if (!connected) {
      const msg = 'Conecte a carteira na rede selecionada antes de revisar.'
      setConn((c) => ({
        ...c,
        status: c.status === 'connected' ? 'idle' : c.status,
        message: msg,
      }))
      toast.error(msg)
      announce(msg, 'assertive')
      return
    }
    setReviewNotice(null)
    await requestQuote(values)
  })

  const confirm = async () => {
    if (!attempt || inFlight.current || quoteStale) return
    inFlight.current = true
    setSubmitting(true)
    setSubmitError(null)
    saveAttempt(attempt) // antes do envio: um refresh agora ainda recupera o mesmo pedido
    try {
      const order = await submitAttempt(attempt, (n) => announce(`Sem resposta do servidor. Reenviando o mesmo pedido (tentativa ${n + 1})…`))
      clearAttempt()
      rememberPendingOrder(user!.id, order.id)
      queryClient.setQueryData(qk.order(user!.id, order.id), order)
      try {
        sessionStorage.removeItem(DRAFT_KEY)
      } catch {
        /* ignore */
      }
      setReviewOpen(false)
      void navigate({ to: '/pedido/$orderId', params: { orderId: order.id } })
    } catch (e) {
      const err = e instanceof ApiError ? e : null
      if (err?.code === 'QUOTE_OUTDATED') {
        // A API devolveu a cotação atual: mostramos e exigimos nova confirmação (nova chave).
        clearAttempt()
        const fresh = (err.details as { quote?: Quote } | undefined)?.quote
        void queryClient.invalidateQueries({ queryKey: qk.cart(user!.id) })
        if (fresh) {
          setQuote(fresh)
          setQuoteSignature(null)
          setAttempt({
            ...attempt,
            key: newIdempotencyKey(),
            body: {
              ...attempt.body,
              quoteId: fresh.id,
              fingerprint: fresh.fingerprint,
            },
          })
        }
        const msg = 'Os valores mudaram desde a revisão. Confira o novo total e confirme novamente.'
        setReviewNotice(msg)
        announce(msg, 'assertive')
      } else if (err?.isTransient) {
        // Continua com a mesma chave salva: "Tentar novamente" não cria outro pedido.
        const msg = 'Não recebemos a confirmação do servidor. Seu pedido pode já ter sido criado: tente novamente, sem risco de compra duplicada.'
        setSubmitError(msg)
        announce(msg, 'assertive')
      } else {
        clearAttempt()
        const msg = err?.message ?? 'Não foi possível criar o pedido'
        setSubmitError(msg)
        announce(msg, 'assertive')
        if (err?.code === 'VALIDATION_ERROR' && err.fields.walletId) setConn({ status: 'idle', message: err.fields.walletId })
      }
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  const [showCoupon, setShowCoupon] = useState(false)
  const reg = form.register

  return (
    <>
      <form onSubmit={onReview} noValidate className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_405px] lg:gap-x-8 lg:gap-y-[25px] wide:grid-cols-[minmax(0,1fr)_calc(405*var(--u))] wide:gap-x-[calc(32*var(--u))]" aria-label="Pagamento" data-testid="checkout-form">
        {/* Perfil do colecionador (no mobile vem depois da carteira, como no Figma) */}
        <section aria-labelledby="perfil-colecionador" className="max-lg:order-2 lg:row-span-2">
          <h2 id="perfil-colecionador" className="mb-3 text-[15px] font-semibold lg:mb-[13px] lg:text-[17px] lg:font-bold lg:leading-6">
            Perfil do colecionador
          </h2>
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:gap-x-[23px] lg:gap-y-[17px] wide:gap-x-[calc(23*var(--u))]">
            <FormField label="Nome de exibição" required error={errors.displayName?.message} {...reg('displayName')} />
            <FormField label="Nome de usuário" required error={errors.username?.message} autoComplete="username" {...reg('username')} />
            <div className="flex flex-col gap-1.5 lg:gap-2">
              <label htmlFor="checkout-network" className="text-[13px] font-medium lg:text-[14px] lg:font-normal lg:leading-4">
                Rede
                <RequiredMark className="max-lg:hidden" />
                <span className="ml-0.5 text-primary lg:hidden" aria-hidden="true">
                  *
                </span>
              </label>
              <div className="relative">
                <select
                  id="checkout-network"
                  {...reg('network', {
                    onChange: () => conn.status === 'connected' && void disconnect(),
                  })}
                  aria-invalid={errors.network ? true : undefined}
                  aria-describedby={errors.network ? 'checkout-network-error' : undefined}
                  className={SELECT}
                >
                  {Network.options.map((n) => (
                    <option key={n} value={n}>
                      {NETWORK_LABEL[n]}
                    </option>
                  ))}
                </select>
                <SelectChevron />
              </div>
              {errors.network && (
                <p id="checkout-network-error" className="text-[12px] text-destructive">
                  ⚠ {errors.network.message}
                </p>
              )}
            </div>
            <FormField label="Nome do perfil" required error={errors.profileName?.message} {...reg('profileName')} />
            <FormField label="Endereço da carteira" value={wallet?.address ?? ''} readOnly placeholder="Endereço 0x da carteira" />
            {/* Figma: o campo secundário não tem rótulo visível no desktop (fica alinhado ao campo do endereço). */}
            <FormField
              label="ENS ou carteira secundária (opcional)"
              value={wallet?.secondaryAddress ?? ''}
              readOnly
              placeholder="ENS ou carteira secundária (opcional)"
              containerClassName="lg:pt-6 lg:[&>label]:sr-only"
            />
            <div className="flex flex-col gap-2 max-lg:hidden">
              <label htmlFor="checkout-provider" className="text-[14px] leading-4">
                Tipo de carteira
                <RequiredMark />
              </label>
              <div className="relative">
                <select id="checkout-provider" {...reg('provider')} className={SELECT}>
                  {WalletProvider.options.map((p) => (
                    <option key={p} value={p}>
                      {PROVIDER_LABEL[p]}
                    </option>
                  ))}
                </select>
                <SelectChevron />
              </div>
            </div>
            <FormField label="Código de indicação" required error={errors.referralCode?.message} {...reg('referralCode')} />
            <FormField label="E-mail" required type="email" autoComplete="email" error={errors.email?.message} {...reg('email')} />
            <FormField
              label="Nome ENS"
              required
              error={errors.ensName?.message}
              prefix={
                <span className="mr-2 grid h-10 shrink-0 place-items-center rounded-md border border-input bg-card px-2 text-[13px] lg:rounded-[2px] lg:border-[#3f2319] lg:bg-transparent lg:px-3 lg:text-[14px]">
                  .eth
                </span>
              }
              {...reg('ensName')}
            />
          </div>
          <div className="mt-4 flex flex-col gap-1.5 lg:mt-6 lg:gap-2">
            <label htmlFor="checkout-note" className="text-[13px] font-medium lg:text-[14px] lg:font-normal lg:leading-4">
              Observação do colecionador (opcional)
            </label>
            <Textarea
              id="checkout-note"
              rows={5}
              className="max-w-md bg-card lg:h-[152px] lg:w-[350px] lg:max-w-none wide:w-[calc(350*var(--u))] lg:resize-none lg:rounded-[2px] lg:border-[#3f2319] lg:bg-transparent lg:text-[14px] lg:shadow-none"
              aria-describedby={errors.note ? 'checkout-note-error' : undefined}
              {...reg('note')}
            />
            {errors.note && (
              <p id="checkout-note-error" className="text-[12px] text-destructive">
                ⚠ {errors.note.message}
              </p>
            )}
          </div>
        </section>

        {/* Resumo + carteira */}
        <aside aria-label="Resumo e carteira" className="space-y-5 max-lg:order-1 max-md:flex max-md:flex-col max-md:gap-5 max-md:space-y-0 lg:space-y-0">
          <section aria-labelledby="seus-nfts" className="max-md:order-3">
            <div className="mb-2 flex justify-between text-[14px] font-semibold lg:mb-3 lg:block lg:border-b lg:border-[#442c1b] lg:pb-2 lg:font-normal">
              <h2 id="seus-nfts" className="lg:text-[17px] lg:font-bold lg:leading-6">
                Seus NFTs
              </h2>
              <p className="lg:mt-[3px] lg:flex lg:justify-between lg:text-[16px] lg:leading-6">
                <span className="hidden lg:inline">NFTs</span>
                <span>Subtotal</span>
              </p>
            </div>
            <ul className="space-y-2 lg:space-y-3">
              {cart.items.map((i) => (
                <li key={i.id} className="flex items-center gap-2 rounded-md bg-card p-1.5 text-[13px] lg:h-[70px] lg:rounded-none lg:bg-[#241612] lg:py-0 lg:pl-1 lg:pr-3 wide:h-[calc(70*var(--u))]">
                  <img {...artSources(i.image, ART_SIZES.checkoutRow)} alt="" width={70} height={70} className="size-10 rounded-sm object-cover lg:size-[70px] lg:rounded-[4px] wide:size-[calc(70*var(--u))]" />
                  <div className="min-w-0 flex-1 lg:ml-[1px]">
                    <p className="truncate font-bold lg:text-[15px] lg:leading-[22px] lg:tracking-[0.5px]">{i.name}</p>
                    <p className="text-[11px] text-muted-foreground lg:text-[13px] lg:leading-5 lg:tracking-[0.3px] lg:text-[#a98b5d]">Edição {i.editionName}</p>
                  </div>
                  <span className="text-[12px] text-muted-foreground lg:text-[13px] lg:text-[#c2a682]">(x {i.quantity})</span>
                  <span className="w-24 text-right font-bold text-primary lg:w-[100px] lg:text-[18px] lg:text-[#e89b55]">{formatEth(i.lineTotal)}</span>
                </li>
              ))}
            </ul>
            {cart.items.some((i) => i.issue) && (
              <p role="alert" className="mt-2 flex items-center gap-1.5 text-[12px] text-warning">
                <AlertTriangle className="size-3.5" aria-hidden="true" /> Há itens com preço ou estoque alterados.{' '}
                <Link to="/carrinho" className="underline">
                  Revisar carrinho
                </Link>
              </p>
            )}
          </section>

          {showCoupon || cart.coupon ? (
            <div className="max-md:order-4">
              <CouponForm cart={cart} />
            </div>
          ) : (
            <button type="button" className="w-full text-center text-[13px] hover:text-primary max-md:order-4 lg:!mt-[7px] lg:text-[14px] lg:leading-6" onClick={() => setShowCoupon(true)}>
              Tem um código promocional? <span className="text-primary lg:text-inherit">Aplique aqui</span>
            </button>
          )}

          <SummaryLines summary={cart.summary} coupon={cart.coupon} variant="checkout" className="max-md:order-5 lg:!mt-[7px]" />
          <p className="-mt-2 text-[11px] text-muted-foreground max-md:order-6 max-md:-mt-3 lg:sr-only">A taxa de rede final depende da rede escolhida e é confirmada na revisão.</p>

          <fieldset className="max-md:order-1 lg:!mt-[2px]">
            <legend className="mb-2 text-center text-[15px] font-semibold max-md:sr-only lg:mb-[17px] lg:w-full lg:text-[17px] lg:font-bold lg:leading-6">Carteira e rede</legend>
            {/* Mobile (Figma): "Carteira conectada" com o atalho para trocar a carteira. */}
            <div className="mb-[13px] flex items-baseline justify-between md:hidden">
              <p className="text-[16px] font-bold leading-6">Carteira conectada</p>
              <Link to="/perfil/carteiras" className="text-[14px] font-bold text-highlight hover:underline">
                Trocar carteira
              </Link>
            </div>
            <div role="radiogroup" aria-label="Carteira" className="space-y-2 max-md:space-y-5 lg:space-y-4">
              {wallets.map((w) => {
                const checked = w.id === walletId
                return (
                  <label
                    key={w.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-md border border-border bg-card p-3 text-[13px] lg:min-h-[45px] lg:gap-[11px] lg:rounded-[2px] lg:border-[#3f2319] lg:bg-transparent lg:py-[5px] lg:text-[15px]',
                      // Mobile (Figma): cartão de 92px sem borda; o rádio mostra a escolha.
                      'max-md:min-h-[92px] max-md:gap-5 max-md:rounded-[12px] max-md:border-0 max-md:py-2.5 max-md:pl-[19px] max-md:pr-3',
                      checked && 'border-primary lg:border-primary',
                    )}
                    data-testid="wallet-option"
                  >
                    <input type="radio" name="wallet" checked={checked} onChange={() => selectWallet(w)} className={RADIO} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold max-md:text-[16px] max-md:leading-6 lg:font-normal lg:leading-[18px]">{w.nickname}</span>
                      <span className="block text-[12px] text-muted-foreground max-md:hidden lg:text-[11px] lg:leading-[14px] lg:text-[#b39463]">
                        {w.secondaryAddress ?? `${w.address.slice(0, 6)}…${w.address.slice(-4)}`} · Rede {NETWORK_LABEL[w.network]} · {PROVIDER_LABEL[w.provider]}
                      </span>
                      <span className="mt-[3px] block truncate text-[14px] leading-[22px] text-muted-foreground md:hidden">
                        {w.secondaryAddress ?? `${w.address.slice(0, 6)}…${w.address.slice(-4)}`}
                      </span>
                      <span className="block text-[14px] leading-[22px] text-muted-foreground md:hidden">Rede {NETWORK_LABEL[w.network]}</span>
                    </span>
                    <MoreVertical className="size-4 shrink-0 text-[#b19362] md:hidden" aria-hidden="true" />
                  </label>
                )
              })}
            </div>
            {errors.walletId && <p className="mt-1 text-[12px] text-destructive">⚠ {errors.walletId.message}</p>}

            {/* Mobile (Figma): tipo de carteira em cartões de 65px. No desktop é o select "Tipo de carteira". */}
            <p aria-hidden="true" className="mt-3 text-[16px] font-bold leading-6 md:hidden">
              Carteira e rede
            </p>
            <div role="radiogroup" aria-label="Tipo de carteira" className="mt-3 space-y-2 max-md:mt-[13px] max-md:space-y-4 lg:hidden">
              {PROVIDER_ORDER.map((p) => (
                <label
                  key={p}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-xl bg-card p-3 text-[13px] max-md:h-[65px] max-md:gap-[11px] max-md:py-0 max-md:pl-[14px] max-md:pr-4 max-md:text-[14px]',
                    provider === p && 'ring-1 ring-primary max-md:ring-0',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="grid size-8 place-items-center rounded-full border border-primary/40 text-[12px] font-bold text-primary max-md:size-10 max-md:border-[#3f2319] max-md:bg-[#2f1d15] max-md:text-[13px] max-md:text-highlight"
                  >
                    {p === 'coinbase' ? <WalletIcon className="size-[18px]" strokeWidth={1.75} /> : PROVIDER_LABEL[p][0]}
                  </span>
                  <span className="flex-1">{PROVIDER_LABEL[p]}</span>
                  <input
                    type="radio"
                    name="provider-choice"
                    checked={provider === p}
                    onChange={() => {
                      if (conn.status === 'connected') void disconnect()
                      form.setValue('provider', p)
                    }}
                    className={cn('size-4 accent-[var(--primary)]', RADIO_MOBILE)}
                  />
                </label>
              ))}
            </div>
            {/* Mobile (Figma): total logo abaixo das carteiras (o resumo completo fica mais abaixo). */}
            <p className="mt-[13px] flex items-baseline justify-end gap-8 text-[16px] font-bold leading-6 md:hidden">
              Total:
              <span className="text-[18px] text-highlight tabular-nums">{formatEth(cart.summary.total)}</span>
            </p>

            <div
              className="mt-3 rounded-md border border-border p-3 text-[13px] max-md:mt-5 max-md:rounded-[12px] max-md:border-0 max-md:bg-card max-md:p-4 lg:mt-4 lg:rounded-[2px] lg:border-[#3f2319]"
              aria-live="polite"
              data-testid="wallet-connection"
              data-status={connected ? 'connected' : conn.status}
            >
              {connected ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-success">
                    <CheckCircle2 className="size-4" aria-hidden="true" /> Conectada via {PROVIDER_LABEL[provider]} · {NETWORK_LABEL[network]}
                  </span>
                  <button type="button" onClick={() => void disconnect()} className="text-primary hover:underline">
                    Desconectar
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <WalletIcon className="size-4" aria-hidden="true" /> Carteira não conectada
                  </p>
                  {conn.message && (
                    <p role="alert" className="text-[12px] text-destructive" data-testid="wallet-error">
                      {conn.message}
                    </p>
                  )}
                  <Button type="button" variant="outline" className="w-full" onClick={() => void connect()} disabled={conn.status === 'connecting'} data-testid="connect-wallet">
                    {conn.status === 'connecting' ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Aguardando a carteira…
                      </>
                    ) : (
                      `Conectar ${PROVIDER_LABEL[provider]}`
                    )}
                  </Button>
                </div>
              )}
            </div>
          </fieldset>
        </aside>

        <div
          ref={submitBarRef}
          className="max-lg:order-3 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-40 max-md:bg-[linear-gradient(transparent,var(--background)_16px)] max-md:px-7 max-md:pb-[27px] max-md:pt-4 lg:col-start-2"
          data-motion-fixed
        >
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
      </form>

      {/* Revisão: Dialog do shadcn (foco preso dentro, Esc fecha, foco volta ao botão) */}
      <Dialog open={reviewOpen} onOpenChange={(o) => !submitting && setReviewOpen(o)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto border-border bg-card sm:max-w-lg" data-testid="review-dialog">
          <DialogHeader>
            <DialogTitle>Revise seu pedido</DialogTitle>
            <DialogDescription>Valores calculados agora pela API para a rede {NETWORK_LABEL[network]}. Confirme para enviar o pedido.</DialogDescription>
          </DialogHeader>
          {quote && (
            <div className="space-y-4 text-[13px]">
              {reviewNotice && (
                <p role="alert" className="rounded-md border border-warning/60 bg-warning/10 p-2.5 text-warning" data-testid="review-notice">
                  {reviewNotice}
                </p>
              )}
              {quoteStale && (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-warning/60 bg-warning/10 p-2.5 text-warning" data-testid="quote-stale">
                  Preço ou disponibilidade mudaram durante a revisão.
                  <Button size="sm" variant="outline" onClick={() => void requestQuote(form.getValues())} disabled={quoting}>
                    Atualizar revisão
                  </Button>
                </div>
              )}
              <ul className="space-y-2">
                {quote.lines.map((l) => (
                  <li key={`${l.nftId}-${l.editionId}`} className="flex items-center gap-2">
                    <img {...artSources(l.image, ART_SIZES.reviewRow)} alt="" width={36} height={36} className="size-9 rounded-sm object-cover" />
                    <span className="flex-1">
                      {l.name}{' '}
                      <span className="text-muted-foreground">
                        · {l.editionName} · {l.quantity} × {formatEth(l.unitPrice)}
                      </span>
                    </span>
                    <span className="font-bold text-primary" data-testid="review-line-total">
                      {formatEth(l.lineTotal)}
                    </span>
                  </li>
                ))}
              </ul>
              <SummaryLines summary={quote} coupon={quote.coupon} />
              <p className="text-[12px] text-muted-foreground">
                Carteira: {wallet?.nickname} ({PROVIDER_LABEL[provider]}) · Cotação válida até{' '}
                {new Date(quote.expiresAt).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
              {submitError && (
                <p role="alert" className="rounded-md border border-destructive/60 bg-destructive/10 p-2.5 text-destructive" data-testid="submit-error">
                  {submitError}
                </p>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReviewOpen(false)} disabled={submitting}>
              Voltar
            </Button>
            <Button onClick={() => void confirm()} disabled={submitting || quoteStale || !quote} data-testid="confirm-purchase" aria-describedby={quoteStale ? undefined : undefined}>
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Enviando pedido…
                </>
              ) : submitError ? (
                'Tentar novamente'
              ) : (
                'Confirmar compra'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

const SELECT =
  'h-10 w-full rounded-md border border-input bg-card px-3 text-[13px] lg:appearance-none lg:rounded-[2px] lg:border-[#3f2319] lg:bg-transparent lg:pr-10 lg:text-[14px] [&>option]:bg-card'

/**
 * Rádio do Figma mobile: anel marrom (clareado para 3:1 de contraste) que fica laranja e ganha o miolo quando marcado.
 * Fica sobre o cartão (#241612), por isso o recorte interno usa a cor do cartão.
 */
const RADIO_MOBILE =
  'max-md:appearance-none max-md:rounded-full max-md:border-[1.5px] max-md:border-[#8c6a4c] max-md:checked:border-primary max-md:checked:bg-primary max-md:checked:shadow-[inset_0_0_0_2.5px_var(--card)]'

/** Rádio do Figma: anel laranja; marcado, ganha o miolo preenchido. */
const RADIO = cn(
  'size-4 shrink-0 accent-[var(--primary)] lg:appearance-none lg:rounded-full lg:border-[1.5px] lg:border-primary lg:checked:bg-primary lg:checked:shadow-[inset_0_0_0_2.5px_var(--background)]',
  RADIO_MOBILE,
)

function SelectChevron() {
  return <ChevronDown className="pointer-events-none absolute right-[28px] top-1/2 hidden size-5 -translate-y-1/2 text-[#b39463] lg:block" strokeWidth={1.5} aria-hidden="true" />
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

/** Barra de texto dentro de uma caixa com a altura da linha final. */
function Line({ className, bar }: { className?: string; bar?: string }) {
  return (
    <div className={cn('flex items-center', className)}>
      <Skeleton className={cn('h-[65%] w-full rounded-sm', bar)} />
    </div>
  )
}

/** Campo em carregamento: o rótulo (fixo) aparece e o campo vira um bloco de 40px com shimmer. */
function FieldSkeleton({ label, required = true, className }: { label: string; required?: boolean; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <p className="text-[14px] leading-4 text-foreground">
        {label}
        {required && <RequiredMark />}
      </p>
      <Skeleton className="h-10 w-full rounded-[2px]" />
    </div>
  )
}

/**
 * Pagamento em carregamento: a mesma grade, a mesma ordem (no celular a carteira vem antes do perfil)
 * e as mesmas alturas do formulário carregado. Rótulos e títulos são fixos e aparecem; o que depende
 * dos dados (campos, carteiras, itens, valores) vira skeleton. Mostra 2 carteiras e 1 item.
 */
function CheckoutSkeleton() {
  const submitBarRef = useBottomBar()
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_405px] lg:gap-x-8 lg:gap-y-[25px] wide:grid-cols-[minmax(0,1fr)_calc(405*var(--u))] wide:gap-x-[calc(32*var(--u))]" aria-busy="true" aria-label="Carregando pagamento" data-testid="checkout-loading">
      <p className="sr-only">Carregando pagamento…</p>
      <div className="max-lg:order-2 lg:row-span-2" aria-hidden="true">
        <p className="mb-3 text-[15px] font-semibold lg:mb-[13px] lg:text-[17px] lg:font-bold lg:leading-6">Perfil do colecionador</p>
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:gap-x-[23px] lg:gap-y-[17px] wide:gap-x-[calc(23*var(--u))]">
          <FieldSkeleton label="Nome de exibição" />
          <FieldSkeleton label="Nome de usuário" />
          <div className="flex flex-col gap-1.5 lg:gap-2">
            <p className="text-[13px] font-medium lg:text-[14px] lg:font-normal lg:leading-4">
              Rede
              <RequiredMark className="max-lg:hidden" />
              <span className="ml-0.5 text-primary lg:hidden">*</span>
            </p>
            <Skeleton className="h-10 w-full rounded-md lg:rounded-[2px]" />
          </div>
          <FieldSkeleton label="Nome do perfil" />
          <FieldSkeleton label="Endereço da carteira" required={false} />
          <FieldSkeleton label="ENS ou carteira secundária (opcional)" required={false} className="lg:pt-6 lg:[&>p]:hidden" />
          <FieldSkeleton label="Tipo de carteira" className="max-lg:hidden" />
          <FieldSkeleton label="Código de indicação" />
          <FieldSkeleton label="E-mail" />
          <FieldSkeleton label="Nome ENS" />
        </div>
        <div className="mt-4 flex flex-col gap-1.5 lg:mt-6 lg:gap-2">
          <p className="text-[13px] font-medium lg:text-[14px] lg:font-normal lg:leading-4">Observação do colecionador (opcional)</p>
          <Skeleton className="h-16 w-full max-w-md rounded-md lg:h-[152px] lg:w-[350px] lg:max-w-none lg:rounded-[2px] wide:w-[calc(350*var(--u))]" />
        </div>
      </div>

      <div className="space-y-5 max-lg:order-1 max-md:flex max-md:flex-col max-md:gap-5 max-md:space-y-0 lg:space-y-0" aria-hidden="true">
        <div className="max-md:order-3">
          <div className="mb-2 flex justify-between text-[14px] font-semibold lg:mb-3 lg:block lg:border-b lg:border-[#442c1b] lg:pb-2 lg:font-normal">
            <p className="lg:text-[17px] lg:font-bold lg:leading-6">Seus NFTs</p>
            <p className="lg:mt-[3px] lg:flex lg:justify-between lg:text-[16px] lg:leading-6">
              <span className="hidden lg:inline">NFTs</span>
              <span>Subtotal</span>
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-md bg-card p-1.5 text-[13px] lg:h-[70px] lg:rounded-none lg:bg-[#241612] lg:py-0 lg:pl-1 lg:pr-3 wide:h-[calc(70*var(--u))]">
            <Skeleton className="size-10 shrink-0 rounded-sm lg:size-[70px] lg:rounded-[4px] wide:size-[calc(70*var(--u))]" />
            <div className="min-w-0 flex-1 lg:ml-[1px]">
              <Line className="h-[19.5px] lg:h-[22px]" bar="w-[140px]" />
              <Line className="h-[16.5px] lg:h-5" bar="w-[90px]" />
            </div>
            <Line className="h-[19.5px] w-24 lg:w-[100px]" bar="ml-auto w-[72px]" />
          </div>
        </div>

        <p className="w-full text-center text-[13px] max-md:order-4 lg:!mt-[7px] lg:text-[14px] lg:leading-6">
          Tem um código promocional? <span className="text-primary lg:text-inherit">Aplique aqui</span>
        </p>

        <SummaryLines summary={null} coupon={null} variant="checkout" className="max-md:order-5 lg:!mt-[7px]" />
        <p className="-mt-2 text-[11px] text-muted-foreground max-md:order-6 max-md:-mt-3 lg:sr-only">A taxa de rede final depende da rede escolhida e é confirmada na revisão.</p>

        <div className="max-md:order-1 lg:!mt-[2px]">
          <p className="mb-2 text-center text-[15px] font-semibold max-md:sr-only lg:mb-[17px] lg:w-full lg:text-[17px] lg:font-bold lg:leading-6">Carteira e rede</p>
          <div className="mb-[13px] flex items-baseline justify-between md:hidden">
            <p className="text-[16px] font-bold leading-6">Carteira conectada</p>
            <span className="text-[14px] font-bold text-highlight">Trocar carteira</span>
          </div>
          <div className="space-y-2 max-md:space-y-5 lg:space-y-4">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-md border border-border bg-card p-3 text-[13px] max-md:min-h-[92px] max-md:gap-5 max-md:rounded-[12px] max-md:border-0 max-md:py-2.5 max-md:pl-[19px] max-md:pr-3 lg:min-h-[45px] lg:gap-[11px] lg:rounded-[2px] lg:border-[#3f2319] lg:bg-transparent lg:py-[5px] lg:text-[15px]"
              >
                <Skeleton className="size-4 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1">
                  <Line className="h-[19.5px] max-md:h-6 lg:h-[18px]" bar="w-[90px]" />
                  <Line className="h-[18px] max-md:hidden lg:h-[14px]" bar="w-[220px]" />
                  <Line className="mt-[3px] h-[22px] md:hidden" bar="w-[120px]" />
                  <Line className="h-[22px] md:hidden" bar="w-[110px]" />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[16px] font-bold leading-6 md:hidden">Carteira e rede</p>
          <div className="mt-3 space-y-2 max-md:mt-[13px] max-md:space-y-4 lg:hidden">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl bg-card p-3 text-[13px] max-md:h-[65px] max-md:gap-[11px] max-md:py-0 max-md:pl-[14px] max-md:pr-4">
                <Skeleton className="size-8 shrink-0 rounded-full max-md:size-10" />
                <Line className="h-[19.5px] flex-1 max-md:h-[21px]" bar="w-[130px]" />
                <Skeleton className="size-4 shrink-0 rounded-full" />
              </div>
            ))}
          </div>
          <p className="mt-[13px] flex items-baseline justify-end gap-8 text-[16px] font-bold leading-6 md:hidden">
            Total:
            <span className="text-[18px]">
              <Skeleton className="inline-block h-[0.72em] w-[96px] rounded-sm align-baseline" />
            </span>
          </p>
          <div className="mt-3 space-y-2 rounded-md border border-border p-3 text-[13px] max-md:mt-5 max-md:rounded-[12px] max-md:border-0 max-md:bg-card max-md:p-4 lg:mt-4 lg:rounded-[2px] lg:border-[#3f2319]">
            <Line className="h-[19.5px]" bar="w-[170px]" />
            <Skeleton className="h-9 w-full" />
          </div>
        </div>
      </div>

      <div
        ref={submitBarRef}
        className="max-lg:order-3 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-40 max-md:bg-[linear-gradient(transparent,var(--background)_16px)] max-md:px-7 max-md:pb-[27px] max-md:pt-4 lg:col-start-2"
        aria-hidden="true"
        data-motion-fixed
      >
        <Skeleton className="h-11 w-full max-lg:h-12 max-lg:rounded-full max-md:h-[60px] lg:h-[45px] lg:rounded-[4px]" />
      </div>
    </div>
  )
}
