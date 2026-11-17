/**
 * Cliente HTTP único (Axios). Toda chamada REST passa por aqui.
 *
 * Responsabilidades:
 *  - anexar o token da sessão (ou o id do carrinho de visitante);
 *  - transformar qualquer falha em `ApiError` tipado (código + campos);
 *  - avisar a camada de sessão quando a API responde SESSION_EXPIRED.
 * Não contém dados fictícios nem caminhos alternativos: quem responde é a API (real ou MSW).
 */
import axios, { AxiosError, type AxiosRequestConfig } from 'axios'
import type { z } from 'zod'
import { ApiErrorBody, type ApiErrorCode } from './contracts'
import { sessionStore } from './session-store'

export const API_URL = import.meta.env.VITE_API_URL ?? '/api'

export const http = axios.create({
  baseURL: API_URL,
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
})

http.interceptors.request.use((config) => {
  const token = sessionStore.getToken()
  if (token) config.headers.set('Authorization', `Bearer ${token}`)
  else {
    const guestCartId = sessionStore.getGuestCartId()
    if (guestCartId) config.headers.set('X-Cart-Id', guestCartId)
  }
  return config
})

export class ApiError extends Error {
  readonly code: ApiErrorCode | 'NETWORK_ERROR' | 'TIMEOUT' | 'CANCELED' | 'UNKNOWN'
  readonly status: number | null
  readonly fields: Record<string, string>
  readonly details: unknown

  constructor(params: { code: ApiError['code']; message: string; status: number | null; fields?: Record<string, string>; details?: unknown }) {
    super(params.message)
    this.name = 'ApiError'
    this.code = params.code
    this.status = params.status
    this.fields = params.fields ?? {}
    this.details = params.details
  }

  /** Falhas que valem nova tentativa automática (rede, timeout, 5xx). */
  get isTransient() {
    return this.code === 'NETWORK_ERROR' || this.code === 'TIMEOUT' || (this.status !== null && this.status >= 500)
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (axios.isCancel(error)) return new ApiError({ code: 'CANCELED', message: 'Requisição cancelada', status: null })
  if (error instanceof AxiosError) {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return new ApiError({ code: 'TIMEOUT', message: 'O servidor demorou para responder.', status: null })
    }
    if (!error.response) {
      return new ApiError({ code: 'NETWORK_ERROR', message: 'Sem conexão com o servidor.', status: null })
    }
    const parsed = ApiErrorBody.safeParse(error.response.data)
    if (parsed.success) {
      const { code, message, fields, details } = parsed.data.error
      return new ApiError({ code, message, status: error.response.status, fields, details })
    }
    return new ApiError({ code: 'UNKNOWN', message: `Erro inesperado (${error.response.status})`, status: error.response.status })
  }
  return new ApiError({ code: 'UNKNOWN', message: 'Erro inesperado', status: null })
}

http.interceptors.response.use(undefined, (error) => {
  const apiError = toApiError(error)
  if (apiError.code === 'SESSION_EXPIRED' && sessionStore.getToken()) {
    sessionStore.markExpired()
  }
  return Promise.reject(apiError)
})

/**
 * Faz a requisição e valida a resposta com o schema do contrato.
 * Se o servidor mandar algo fora do contrato, falha aqui (borda), não no componente.
 */
export async function request<S extends z.ZodTypeAny>(schema: S, config: AxiosRequestConfig): Promise<z.infer<S>> {
  const res = await http.request(config)
  const parsed = schema.safeParse(res.data)
  if (!parsed.success) {
    console.error('[api] resposta fora do contrato', config.url, parsed.error.issues)
    throw new ApiError({ code: 'UNKNOWN', message: 'Resposta inválida do servidor', status: res.status })
  }
  return parsed.data
}
