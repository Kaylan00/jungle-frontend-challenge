import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { CollectorInput, type Cart, type Quote } from '@/api/contracts'
import { api } from '@/api/endpoints'
import { ApiError } from '@/api/http'
import { qk } from '@/api/queries'
import { useSession } from '@/features/auth/use-session'
import { announce } from '@/lib/announcer'
import { clearDraft, type CheckoutValues } from './checkout-model'
import { clearAttempt, newIdempotencyKey, rememberPendingOrder, saveAttempt, submitAttempt, type OrderAttempt } from './order-attempt'
import type { CheckoutFormApi } from './use-checkout-form'
import type { WalletConnectionApi } from './use-wallet-connection'

/**
 * Revisão e confirmação do pedido:
 *  - "Revisar" pede uma COTAÇÃO à API (preço, disponibilidade, cupom e taxa) e prepara a tentativa de pedido
 *    com uma chave de idempotência;
 *  - evento em tempo real que muda o carrinho depois da cotação deixa a revisão desatualizada (trava confirmar);
 *  - "Confirmar" envia a tentativa (salva antes, para um refresh recuperar o mesmo pedido) e trata cotação
 *    vencida (409 QUOTE_OUTDATED, com a cotação nova), falha transitória (mesma chave) e erro definitivo.
 */
export function useOrderReview({ cart, checkout, connection }: { cart: Cart; checkout: CheckoutFormApi; connection: WalletConnectionApi }) {
  const { user } = useSession()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { form } = checkout

  const [quote, setQuote] = useState<Quote | null>(null)
  // "Assinatura" do carrinho no momento da cotação: preço, estoque e quantidade de cada item.
  const signature = cart.items.map((i) => `${i.editionId}:${i.unitPrice}:${i.available}:${i.quantity}`).join('|')
  const [quoteSignature, setQuoteSignature] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [attempt, setAttempt] = useState<OrderAttempt | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const inFlight = useRef(false)

  // Evento em tempo real mudou o carrinho depois da cotação: a revisão fica desatualizada.
  const stale = open && quote !== null && quoteSignature !== null && signature !== quoteSignature

  useEffect(() => {
    if (stale) announce('Preço ou disponibilidade mudaram desde a revisão. Atualize a revisão antes de confirmar.', 'assertive')
  }, [stale])

  const requestQuote = async (values: CheckoutValues) => {
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
      setOpen(true)
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

  /** Envio do formulário: valida, exige a carteira conectada e abre a revisão. */
  const review = form.handleSubmit(async (values) => {
    if (!connection.connected) {
      const msg = 'Conecte a carteira na rede selecionada antes de revisar.'
      connection.flagConnection(msg)
      toast.error(msg)
      announce(msg, 'assertive')
      return
    }
    setNotice(null)
    await requestQuote(values)
  })

  /** "Atualizar revisão" depois de um evento em tempo real. */
  const refresh = () => void requestQuote(form.getValues())

  const confirm = async () => {
    if (!attempt || inFlight.current || stale) return
    inFlight.current = true
    setSubmitting(true)
    setSubmitError(null)
    saveAttempt(attempt) // antes do envio: um refresh agora ainda recupera o mesmo pedido
    try {
      const order = await submitAttempt(attempt, (n) => announce(`Sem resposta do servidor. Reenviando o mesmo pedido (tentativa ${n + 1})…`))
      clearAttempt()
      rememberPendingOrder(user!.id, order.id)
      queryClient.setQueryData(qk.order(user!.id, order.id), order)
      clearDraft()
      setOpen(false)
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
        setNotice(msg)
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
        if (err?.code === 'VALIDATION_ERROR' && err.fields.walletId) connection.flagConnection(err.fields.walletId, true)
      }
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  /** Fechar a revisão (Esc, fora ou "Voltar"): não enquanto o pedido é enviado. */
  const setReviewOpen = (next: boolean) => {
    if (!submitting) setOpen(next)
  }

  return { quote, stale, open, setReviewOpen, notice, quoting, submitting, submitError, review, refresh, confirm }
}

export type OrderReviewApi = ReturnType<typeof useOrderReview>
