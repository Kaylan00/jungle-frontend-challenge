/**
 * Infra comum dos handlers REST simulados: latência, falhas configuráveis, autenticação e erros
 * no formato do contrato `ApiErrorBody`.
 */
import { delay, HttpResponse } from 'msw'
import type { ApiErrorBody, ApiErrorCode } from '@/api/contracts'
import { initDb, lookupSession, type StoredUser } from './db'
import { getScenario, nextLatency, takeFault } from './scenario'

export const API = '/api'

const STATUS: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 422,
  UNAUTHENTICATED: 401,
  SESSION_EXPIRED: 401,
  INVALID_CREDENTIALS: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  EMAIL_TAKEN: 409,
  AVAILABILITY_CONFLICT: 409,
  QUOTE_OUTDATED: 409,
  IDEMPOTENCY_CONFLICT: 409,
  WALLET_REJECTED: 409,
  COUPON_INVALID: 422,
  COUPON_EXPIRED: 422,
  RESET_TOKEN_INVALID: 400,
  RESET_TOKEN_EXPIRED: 410,
  TRANSIENT_FAILURE: 503,
  INTERNAL_ERROR: 500,
}

export function apiError(code: ApiErrorCode, message: string, extra: Omit<ApiErrorBody['error'], 'code' | 'message'> = {}) {
  return HttpResponse.json<ApiErrorBody>({ error: { code, message, ...extra } }, { status: STATUS[code] })
}

let listSeq = 0

/**
 * Aplica as condições de rede do cenário antes do handler.
 * Retorna uma Response quando a requisição deve falhar; `null` para seguir.
 */
export async function simulateNetwork(request: Request): Promise<Response | null> {
  await initDb()
  const url = new URL(request.url)
  const fault = takeFault(request.method, url.pathname)
  if (fault === 'network') return HttpResponse.error()
  if (fault === 'timeout') {
    // Nunca responde: o timeout do Axios no cliente encerra a requisição.
    await delay('infinite')
  }

  let ms = nextLatency()
  if (getScenario().outOfOrder && request.method === 'GET' && url.pathname === `${API}/nfts`) {
    // Alterna lenta/rápida: uma busca digitada depois pode chegar antes da anterior.
    listSeq += 1
    ms = listSeq % 2 === 1 ? 1600 : 200
  }
  if (ms > 0) await delay(ms)

  if (fault === 'http500') return apiError('INTERNAL_ERROR', 'Erro interno simulado (500)')
  if (fault === 'http503') return apiError('TRANSIENT_FAILURE', 'Serviço temporariamente indisponível (503)')
  return null
}

export function bearer(request: Request) {
  const h = request.headers.get('authorization')
  return h?.startsWith('Bearer ') ? h.slice(7) : null
}

/** Exige sessão válida. Diferencia sessão expirada (401 SESSION_EXPIRED) de ausente (401 UNAUTHENTICATED). */
export function requireUser(request: Request): { user: StoredUser; token: string } | Response {
  const token = bearer(request)
  const s = lookupSession(token)
  if (s.status === 'ok') return { user: s.user, token: token! }
  if (s.status === 'expired') return apiError('SESSION_EXPIRED', 'Sua sessão expirou. Entre novamente.')
  return apiError('UNAUTHENTICATED', 'Faça login para continuar.')
}

/**
 * Rotas do painel: sem sessão = 401 (como as outras privadas); com sessão de conta comum = 403 FORBIDDEN.
 * O papel é lido do banco a cada requisição, nunca do cliente.
 */
export function requireAdmin(request: Request): { user: StoredUser; token: string } | Response {
  const auth = requireUser(request)
  if (auth instanceof Response) return auth
  if (auth.user.role !== 'admin') return apiError('FORBIDDEN', 'Esta área é só para administradores da Kurio.')
  return auth
}

export function optionalUser(request: Request): StoredUser | null {
  const s = lookupSession(bearer(request))
  return s.status === 'ok' ? s.user : null
}

export async function readJson<T = unknown>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T
  } catch {
    return null
  }
}

/** Converte issues do zod em { campo: mensagem } para o formato de erro da API. */
export function zodFields(issues: Array<{ path: PropertyKey[]; message: string }>) {
  const fields: Record<string, string> = {}
  for (const i of issues) {
    const key = String(i.path[0] ?? '_')
    fields[key] ??= i.message
  }
  return fields
}
