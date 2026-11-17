/**
 * Envio do pedido sem duplicar compra.
 *
 * Cada "tentativa de compra" ganha uma chave de idempotência (UUID) criada quando a pessoa
 * revisa uma cotação. A chave + o corpo do pedido ficam no sessionStorage ANTES do envio:
 *  - clique repetido: o botão trava e um ref impede um segundo POST simultâneo;
 *  - timeout / queda de rede / 5xx: reenviamos o MESMO corpo com a MESMA chave
 *    (o servidor devolve o pedido já criado, não cria outro);
 *  - refresh no meio do envio: ao voltar para o checkout a tentativa salva é reenviada
 *    com a mesma chave e recupera o mesmo pedido;
 *  - conteúdo mudou (nova cotação): nova chave. Reusar a chave com outro corpo dá 409.
 */
import type { CreateOrderInput, Order } from '@/api/contracts'
import { api } from '@/api/endpoints'
import { ApiError, toApiError } from '@/api/http'

const ATTEMPT_KEY = 'kurio.checkout.attempt'
const PENDING_KEY = (userId: string) => `kurio.pendingOrder.${userId}`

export interface OrderAttempt {
  userId: string
  key: string
  body: CreateOrderInput
  createdAt: string
}

export function newIdempotencyKey() {
  return crypto.randomUUID()
}

export function saveAttempt(attempt: OrderAttempt) {
  try {
    sessionStorage.setItem(ATTEMPT_KEY, JSON.stringify(attempt))
  } catch {
    /* ignore */
  }
}

export function loadAttempt(userId: string): OrderAttempt | null {
  try {
    const raw = sessionStorage.getItem(ATTEMPT_KEY)
    if (!raw) return null
    const a = JSON.parse(raw) as OrderAttempt
    return a.userId === userId ? a : null
  } catch {
    return null
  }
}

export function clearAttempt() {
  try {
    sessionStorage.removeItem(ATTEMPT_KEY)
  } catch {
    /* ignore */
  }
}

export function rememberPendingOrder(userId: string, orderId: string | null) {
  try {
    if (orderId) localStorage.setItem(PENDING_KEY(userId), orderId)
    else localStorage.removeItem(PENDING_KEY(userId))
  } catch {
    /* ignore */
  }
}

export function getRememberedPendingOrder(userId: string) {
  try {
    return localStorage.getItem(PENDING_KEY(userId))
  } catch {
    return null
  }
}

const MAX_AUTO_RETRIES = 2

/**
 * Envia a tentativa; repete sozinho (com a mesma chave) em falhas transitórias.
 * Erros de negócio (cotação desatualizada, conflito, validação) sobem na hora.
 */
export async function submitAttempt(attempt: OrderAttempt, onRetry?: (n: number) => void): Promise<Order> {
  let lastError: ApiError | null = null
  for (let i = 0; i <= MAX_AUTO_RETRIES; i++) {
    if (i > 0) {
      onRetry?.(i)
      await new Promise((r) => setTimeout(r, 800 * i))
    }
    try {
      return await api.createOrder(attempt.body, attempt.key)
    } catch (e) {
      lastError = toApiError(e)
      if (!lastError.isTransient) throw lastError
    }
  }
  throw lastError ?? new ApiError({ code: 'UNKNOWN', message: 'Falha ao enviar pedido', status: null })
}
