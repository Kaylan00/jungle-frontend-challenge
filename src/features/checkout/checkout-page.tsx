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
import { AlertTriangle, CheckCircle2, ChevronLeft, Loader2, Wallet as WalletIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { CollectorInput, Network, WalletProvider, type Cart, type Quote, type Wallet } from '@/api/contracts'
import { api } from '@/api/endpoints'
import { ApiError } from '@/api/http'
import { qk, walletsQuery } from '@/api/queries'
import { EmptyState, ErrorState } from '@/components/shared/error-state'
import { FormField } from '@/components/shared/form-field'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useSession } from '@/features/auth/use-session'
import { CouponForm, SummaryLines, SummarySkeleton } from '@/features/cart/cart-summary'
import { useCart } from '@/features/cart/hooks'
import { NETWORK_LABEL } from '@/features/catalog/search-params'
import { announce } from '@/lib/announcer'
import { formatEth } from '@/lib/eth'
import { cn } from '@/lib/utils'
import { clearAttempt, loadAttempt, newIdempotencyKey, rememberPendingOrder, saveAttempt, submitAttempt, type OrderAttempt } from './order-attempt'

const CheckoutForm = CollectorInput.extend({
  network: Network,
  provider: WalletProvider,
  walletId: z.string().min(1, 'Selecione uma carteira'),
})
type CheckoutForm = z.infer<typeof CheckoutForm>

const PROVIDER_LABEL: Record<WalletProvider, string> = { walletconnect: 'WalletConnect', metamask: 'MetaMask', coinbase: 'Coinbase Wallet' }
const DRAFT_KEY = 'kurio.checkout.draft'

type Connection = { status: 'idle' | 'connecting' | 'connected' | 'rejected'; walletId?: string; network?: Network; message?: string }

export function CheckoutPage() {
  const { user } = useSession()
  const cart = useCart()
  const wallets = useQuery(walletsQuery(user!.id))
  const [recovering, setRecovering] = useState(() => (user ? loadAttempt(user.id) : null))

  if (recovering) return <RecoverAttempt attempt={recovering} onGiveUp={() => setRecovering(null)} />

  return (
    <div className="container-page pt-4 md:pt-6">
      <nav aria-label="Trilha de navegação" className="mb-4 hidden text-[13px] font-semibold md:block">
        <ol className="flex gap-1.5">
          <li><Link to="/" className="hover:text-primary">Início</Link></li>
          <li aria-hidden="true">/</li>
          <li><Link to="/carrinho" className="hover:text-primary">Carrinho</Link></li>
          <li aria-hidden="true">/</li>
          <li aria-current="page">Pagamento</li>
        </ol>
      </nav>
      <div className="mb-4 flex items-center gap-3 md:hidden">
        <Link to="/carrinho" className="grid size-9 place-items-center rounded-full bg-card text-primary" aria-label="Voltar ao carrinho">
          <ChevronLeft className="size-5" aria-hidden="true" />
        </Link>
        <h1 className="flex-1 text-center text-xl font-bold">Pagamento com carteira</h1>
        <span className="size-9" />
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
          action={<Link to="/" hash="catalogo" className={buttonVariants()}>Explorar NFTs</Link>}
        />
      ) : wallets.data.items.length === 0 ? (
        <EmptyState
          title="Cadastre uma carteira para pagar"
          message="As carteiras cadastradas ficam disponíveis no pagamento."
          action={<Link to="/perfil/carteiras" className={buttonVariants()}>Cadastrar carteira</Link>}
        />
      ) : (
        <CheckoutForm_ cart={cart.data} wallets={wallets.data.items} />
      )}
    </div>
  )
}

function CheckoutForm_({ cart, wallets }: { cart: Cart; wallets: Wallet[] }) {
  const { user } = useSession()
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

  const form = useForm<CheckoutForm>({ resolver: zodResolver(CheckoutForm), defaultValues: defaults, mode: 'onTouched' })
  const { errors } = form.formState
  const walletId = form.watch('walletId')
  const network = form.watch('network')
  const provider = form.watch('provider')
  const wallet = wallets.find((w) => w.id === walletId)

  // Rascunho: sobrevive a refresh e à expiração da sessão (volta preenchido após o login).
  useEffect(() => {
    const sub = form.watch((values) => {
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(values))
      } catch {
        /* ignore */
      }
    })
    return () => sub.unsubscribe()
  }, [form])

  // ---- Conexão simulada da carteira ----
  const [conn, setConn] = useState<Connection>({ status: 'idle' })
  const connected = conn.status === 'connected' && conn.walletId === walletId && conn.network === network

  const connect = async () => {
    if (!wallet) return
    if (wallet.network !== network) {
      form.setError('network', { type: 'manual', message: `A carteira ${wallet.nickname} opera na rede ${NETWORK_LABEL[wallet.network]}` })
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
      const q = await api.createQuote({ network: values.network, couponCode: cart.coupon?.code ?? null })
      setQuote(q)
      setQuoteSignature(signature)
      setAttempt({
        userId: user!.id,
        key: newIdempotencyKey(),
        body: { quoteId: q.id, fingerprint: q.fingerprint, walletId: values.walletId, network: values.network, provider: values.provider, collector: CollectorInput.parse(values) },
        createdAt: new Date().toISOString(),
      })
      setReviewOpen(true)
    } catch (e) {
      const err = e instanceof ApiError ? e : null
      const msg = err?.code === 'AVAILABILITY_CONFLICT' ? 'Alguns itens não têm mais a quantidade desejada. Ajuste o carrinho.' : err?.message ?? 'Não foi possível gerar a revisão'
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
      setConn((c) => ({ ...c, status: c.status === 'connected' ? 'idle' : c.status, message: msg }))
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
          setAttempt({ ...attempt, key: newIdempotencyKey(), body: { ...attempt.body, quoteId: fresh.id, fingerprint: fresh.fingerprint } })
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
      <form onSubmit={onReview} noValidate className="grid gap-8 lg:grid-cols-[1fr_400px] lg:gap-x-12 lg:gap-y-5" aria-label="Pagamento" data-testid="checkout-form">
        {/* Perfil do colecionador (no mobile vem depois da carteira, como no Figma) */}
        <section aria-labelledby="perfil-colecionador" className="max-lg:order-2 lg:row-span-2">
          <h2 id="perfil-colecionador" className="mb-3 text-[15px] font-semibold">
            Perfil do colecionador
          </h2>
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
            <FormField label="Nome de exibição" required error={errors.displayName?.message} {...reg('displayName')} />
            <FormField label="Nome de usuário" required error={errors.username?.message} autoComplete="username" {...reg('username')} />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="checkout-network" className="text-[13px] font-medium">
                Rede<span className="ml-0.5 text-primary" aria-hidden="true">*</span>
              </label>
              <select
                id="checkout-network"
                {...reg('network', { onChange: () => conn.status === 'connected' && void disconnect() })}
                aria-invalid={errors.network ? true : undefined}
                aria-describedby={errors.network ? 'checkout-network-error' : undefined}
                className="h-10 rounded-md border border-input bg-card px-3 text-[13px]"
              >
                {Network.options.map((n) => (
                  <option key={n} value={n}>
                    {NETWORK_LABEL[n]}
                  </option>
                ))}
              </select>
              {errors.network && (
                <p id="checkout-network-error" className="text-[12px] text-destructive">
                  ⚠ {errors.network.message}
                </p>
              )}
            </div>
            <FormField label="Nome do perfil" required error={errors.profileName?.message} {...reg('profileName')} />
            <FormField label="Endereço da carteira" value={wallet?.address ?? ''} readOnly hint="Preenchido pela carteira selecionada." />
            <FormField label="ENS ou carteira secundária (opcional)" value={wallet?.secondaryAddress ?? ''} readOnly placeholder="ENS ou carteira secundária (opcional)" />
            <div className="flex flex-col gap-1.5 max-lg:hidden">
              <label htmlFor="checkout-provider" className="text-[13px] font-medium">
                Tipo de carteira<span className="ml-0.5 text-primary" aria-hidden="true">*</span>
              </label>
              <select id="checkout-provider" {...reg('provider')} className="h-10 rounded-md border border-input bg-card px-3 text-[13px]">
                {WalletProvider.options.map((p) => (
                  <option key={p} value={p}>
                    {PROVIDER_LABEL[p]}
                  </option>
                ))}
              </select>
            </div>
            <FormField label="Código de indicação" required error={errors.referralCode?.message} {...reg('referralCode')} />
            <FormField label="E-mail" required type="email" autoComplete="email" error={errors.email?.message} {...reg('email')} />
            <FormField
              label="Nome ENS"
              required
              error={errors.ensName?.message}
              prefix={<span className="mr-2 grid h-10 shrink-0 place-items-center rounded-md border border-input bg-card px-2 text-[13px]">.eth</span>}
              {...reg('ensName')}
            />
          </div>
          <div className="mt-4 flex flex-col gap-1.5">
            <label htmlFor="checkout-note" className="text-[13px] font-medium">
              Observação do colecionador (opcional)
            </label>
            <Textarea id="checkout-note" rows={5} className="max-w-md bg-card" aria-describedby={errors.note ? 'checkout-note-error' : undefined} {...reg('note')} />
            {errors.note && (
              <p id="checkout-note-error" className="text-[12px] text-destructive">
                ⚠ {errors.note.message}
              </p>
            )}
          </div>
        </section>

        {/* Resumo + carteira */}
        <aside aria-label="Resumo e carteira" className="space-y-5 max-lg:order-1">
          <section aria-labelledby="seus-nfts">
            <div className="mb-2 flex justify-between text-[14px] font-semibold">
              <h2 id="seus-nfts">Seus NFTs</h2>
              <span>Subtotal</span>
            </div>
            <ul className="space-y-2">
              {cart.items.map((i) => (
                <li key={i.id} className="flex items-center gap-2 rounded-md bg-card p-1.5 text-[13px]">
                  <img src={i.image} alt="" width={40} height={40} className="size-10 rounded-sm object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{i.name}</p>
                    <p className="text-[11px] text-muted-foreground">Edição {i.editionName}</p>
                  </div>
                  <span className="text-[12px] text-muted-foreground">(x {i.quantity})</span>
                  <span className="w-24 text-right font-bold text-primary">{formatEth(i.lineTotal)}</span>
                </li>
              ))}
            </ul>
            {cart.items.some((i) => i.issue) && (
              <p role="alert" className="mt-2 flex items-center gap-1.5 text-[12px] text-warning">
                <AlertTriangle className="size-3.5" aria-hidden="true" /> Há itens com preço ou estoque alterados. <Link to="/carrinho" className="underline">Revisar carrinho</Link>
              </p>
            )}
          </section>

          {showCoupon || cart.coupon ? (
            <CouponForm cart={cart} />
          ) : (
            <button type="button" className="w-full text-center text-[13px] hover:text-primary" onClick={() => setShowCoupon(true)}>
              Tem um código promocional? <span className="text-primary">Aplique aqui</span>
            </button>
          )}

          <SummaryLines summary={cart.summary} coupon={cart.coupon} />
          <p className="-mt-2 text-[11px] text-muted-foreground">A taxa de rede final depende da rede escolhida e é confirmada na revisão.</p>

          <fieldset>
            <legend className="mb-2 text-center text-[15px] font-semibold">Carteira e rede</legend>
            <div role="radiogroup" aria-label="Carteira" className="space-y-2">
              {wallets.map((w) => {
                const checked = w.id === walletId
                return (
                  <label
                    key={w.id}
                    className={cn('flex cursor-pointer items-center gap-3 rounded-md border border-border bg-card p-3 text-[13px]', checked && 'border-primary')}
                    data-testid="wallet-option"
                  >
                    <input type="radio" name="wallet" checked={checked} onChange={() => selectWallet(w)} className="size-4 accent-[var(--primary)]" />
                    <span className="flex-1">
                      <span className="block font-bold">{w.nickname}</span>
                      <span className="block text-[12px] text-muted-foreground">
                        {w.secondaryAddress ?? `${w.address.slice(0, 6)}…${w.address.slice(-4)}`} · Rede {NETWORK_LABEL[w.network]} · {PROVIDER_LABEL[w.provider]}
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
            {errors.walletId && <p className="mt-1 text-[12px] text-destructive">⚠ {errors.walletId.message}</p>}

            {/* Mobile (Figma): tipo de carteira em cartões. No desktop é o select "Tipo de carteira". */}
            <div role="radiogroup" aria-label="Tipo de carteira" className="mt-3 space-y-2 lg:hidden">
              {WalletProvider.options.map((p) => (
                <label key={p} className={cn('flex cursor-pointer items-center gap-3 rounded-xl bg-card p-3 text-[13px]', provider === p && 'ring-1 ring-primary')}>
                  <span aria-hidden="true" className="grid size-8 place-items-center rounded-full border border-primary/40 text-[12px] font-bold text-primary">
                    {PROVIDER_LABEL[p][0]}
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
                    className="size-4 accent-[var(--primary)]"
                  />
                </label>
              ))}
            </div>

            <div className="mt-3 rounded-md border border-border p-3 text-[13px]" aria-live="polite" data-testid="wallet-connection" data-status={connected ? 'connected' : conn.status}>
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

        <div className="max-lg:order-3 lg:col-start-2">
          <Button type="submit" className="h-11 w-full font-semibold max-lg:h-12 max-lg:rounded-full" disabled={quoting} data-testid="review-button">
            {quoting ? 'Gerando revisão…' : 'Revisar e confirmar compra'}
          </Button>
        </div>
      </form>

      {/* Revisão: Dialog do shadcn (foco preso dentro, Esc fecha, foco volta ao botão) */}
      <Dialog open={reviewOpen} onOpenChange={(o) => !submitting && setReviewOpen(o)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto border-border bg-card sm:max-w-lg" data-testid="review-dialog">
          <DialogHeader>
            <DialogTitle>Revise seu pedido</DialogTitle>
            <DialogDescription>
              Valores calculados agora pela API para a rede {NETWORK_LABEL[network]}. Confirme para enviar o pedido.
            </DialogDescription>
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
                    <img src={l.image} alt="" width={36} height={36} className="size-9 rounded-sm object-cover" />
                    <span className="flex-1">
                      {l.name} <span className="text-muted-foreground">· {l.editionName} · {l.quantity} × {formatEth(l.unitPrice)}</span>
                    </span>
                    <span className="font-bold text-primary" data-testid="review-line-total">{formatEth(l.lineTotal)}</span>
                  </li>
                ))}
              </ul>
              <SummaryLines summary={quote} coupon={quote.coupon} />
              <p className="text-[12px] text-muted-foreground">
                Carteira: {wallet?.nickname} ({PROVIDER_LABEL[provider]}) · Cotação válida até {new Date(quote.expiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
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
      void navigate({ to: '/pedido/$orderId', params: { orderId: order.id }, replace: true })
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
  const pending = useQuery({ queryKey: [...qk.orders(user!.id), 'pending'], queryFn: ({ signal }) => api.listOrders('pending', { signal }) })
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

function CheckoutSkeleton() {
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_400px]" aria-busy="true" aria-label="Carregando pagamento">
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
      <div className="space-y-4">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
        <SummarySkeleton />
      </div>
    </div>
  )
}
