import axios, { AxiosError, AxiosHeaders, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

// Módulos com estado (networkRecovery e sessão): uma cópia nova por teste.
let mod: typeof import('./http')
let session: typeof import('./session-store')['sessionStore']

beforeEach(async () => {
  vi.resetModules()
  mod = await import('./http')
  session = (await import('./session-store')).sessionStore
})

type Reply = { status?: number; data?: unknown; headers?: Record<string, string> }

/**
 * Adapter falso no lugar da rede: passa pelos interceptors de verdade e reproduz o que o adapter do
 * Axios faz (status fora de 2xx vira AxiosError com a resposta).
 */
function fakeAdapter(...replies: Array<Reply | ((config: InternalAxiosRequestConfig) => Reply | Promise<never>)>) {
  const calls: InternalAxiosRequestConfig[] = []
  const adapter: AxiosAdapter = async (config) => {
    calls.push(config)
    const next = replies[Math.min(calls.length - 1, replies.length - 1)]
    const reply = typeof next === 'function' ? await next(config) : next
    const response: AxiosResponse = {
      data: reply.data ?? '',
      status: reply.status ?? 200,
      statusText: '',
      headers: new AxiosHeaders(reply.headers ?? {}),
      config,
    }
    if (response.status >= 200 && response.status < 300) return response
    throw new AxiosError(`Request failed with status code ${response.status}`, AxiosError.ERR_BAD_RESPONSE, config, {}, response)
  }
  mod.http.defaults.adapter = adapter
  return calls
}

const JSON_HEADERS = { 'content-type': 'application/json' }
const HTML = { status: 200, data: '<!doctype html><html></html>', headers: { 'content-type': 'text/html; charset=utf-8' } }
const Item = z.object({ id: z.string() })

function axiosErr(code: string | undefined, response?: { status: number; data: unknown }) {
  const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig
  return new AxiosError('falha', code, config, {}, response && { ...response, statusText: '', headers: {}, config })
}

describe('toApiError', () => {
  it('timeout (ECONNABORTED e ETIMEDOUT)', () => {
    for (const code of ['ECONNABORTED', 'ETIMEDOUT']) {
      const e = mod.toApiError(axiosErr(code))
      expect(e).toMatchObject({ code: 'TIMEOUT', status: null })
      expect(e.isTransient).toBe(true)
    }
  })

  it('sem resposta = erro de rede', () => {
    const e = mod.toApiError(axiosErr('ERR_NETWORK'))
    expect(e).toMatchObject({ code: 'NETWORK_ERROR', status: null, message: 'Sem conexão com o servidor.' })
    expect(e.isTransient).toBe(true)
  })

  it('cancelado (AbortController/CanceledError) não é transitório', () => {
    const e = mod.toApiError(new axios.CanceledError())
    expect(e.code).toBe('CANCELED')
    expect(e.isTransient).toBe(false)
  })

  it('corpo de erro no contrato vira código, campos e detalhes', () => {
    const e = mod.toApiError(
      axiosErr(undefined, {
        status: 422,
        data: { error: { code: 'VALIDATION_ERROR', message: 'Confira', fields: { email: 'E-mail inválido' }, details: { x: 1 } } },
      }),
    )
    expect(e).toBeInstanceOf(mod.ApiError)
    expect(e).toMatchObject({ code: 'VALIDATION_ERROR', message: 'Confira', status: 422, fields: { email: 'E-mail inválido' }, details: { x: 1 } })
    expect(e.isTransient).toBe(false)
  })

  it('corpo fora do contrato (HTML, código desconhecido, vazio) vira UNKNOWN com o status', () => {
    for (const data of ['<html>502</html>', { error: { code: 'NOPE', message: 'x' } }, { message: 'sem envelope' }, null]) {
      const e = mod.toApiError(axiosErr(undefined, { status: 502, data }))
      expect(e).toMatchObject({ code: 'UNKNOWN', status: 502, message: 'Erro inesperado (502)', fields: {} })
      expect(e.isTransient).toBe(true)
    }
  })

  it('erro que não é do Axios vira UNKNOWN sem status; ApiError passa direto', () => {
    expect(mod.toApiError(new TypeError('boom'))).toMatchObject({ code: 'UNKNOWN', status: null })
    expect(mod.toApiError('texto')).toMatchObject({ code: 'UNKNOWN', status: null })
    const original = new mod.ApiError({ code: 'CONFLICT', message: 'x', status: 409 })
    expect(mod.toApiError(original)).toBe(original)
  })
})

describe('ApiError.isTransient', () => {
  const make = (code: InstanceType<typeof mod.ApiError>['code'], status: number | null) => new mod.ApiError({ code, message: '', status })

  it('rede, timeout e 5xx valem nova tentativa', () => {
    expect(make('NETWORK_ERROR', null).isTransient).toBe(true)
    expect(make('TIMEOUT', null).isTransient).toBe(true)
    expect(make('TRANSIENT_FAILURE', 503).isTransient).toBe(true)
    expect(make('INTERNAL_ERROR', 500).isTransient).toBe(true)
  })

  it('4xx, cancelado e desconhecido sem status não', () => {
    expect(make('VALIDATION_ERROR', 422).isTransient).toBe(false)
    expect(make('SESSION_EXPIRED', 401).isTransient).toBe(false)
    expect(make('CONFLICT', 409).isTransient).toBe(false)
    expect(make('CANCELED', null).isTransient).toBe(false)
    expect(make('UNKNOWN', null).isTransient).toBe(false)
    expect(make('UNKNOWN', 499).isTransient).toBe(false)
  })
})

describe('request()', () => {
  afterEach(() => {
    session.clear()
  })

  it('valida a resposta com o schema e devolve o dado já parseado', async () => {
    fakeAdapter({ data: { id: 'a', extra: true }, headers: JSON_HEADERS })
    await expect(mod.request(Item, { url: '/x' })).resolves.toEqual({ id: 'a' })
  })

  it('resposta fora do contrato falha na borda com UNKNOWN e o status', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    fakeAdapter({ data: { id: 1 }, headers: JSON_HEADERS })
    await expect(mod.request(Item, { url: '/x' })).rejects.toMatchObject({ code: 'UNKNOWN', status: 200, message: 'Resposta inválida do servidor' })
    expect(log).toHaveBeenCalledOnce()
  })

  it('204 sem corpo e sem content-type não é falha', async () => {
    const recovery = vi.fn(async () => {})
    mod.setNetworkRecovery(recovery)
    const calls = fakeAdapter({ status: 204, data: '' })
    await expect(mod.request(z.any(), { method: 'DELETE', url: '/wallets/1/connect' })).resolves.toBe('')
    expect(recovery).not.toHaveBeenCalled()
    expect(calls).toHaveLength(1)
  })

  it('erro HTTP vira ApiError tipado', async () => {
    fakeAdapter({ status: 409, data: { error: { code: 'QUOTE_OUTDATED', message: 'Mudou' } }, headers: JSON_HEADERS })
    const err = await mod.request(Item, { method: 'POST', url: '/orders' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(mod.ApiError)
    expect(err).toMatchObject({ code: 'QUOTE_OUTDATED', status: 409 })
  })

  it('pedido já cancelado vira CANCELED sem chegar à rede', async () => {
    const calls = fakeAdapter({ data: { id: 'a' } })
    const ctrl = new AbortController()
    ctrl.abort()
    await expect(mod.request(Item, { url: '/x', signal: ctrl.signal })).rejects.toMatchObject({ code: 'CANCELED' })
    expect(calls).toHaveLength(0)
  })

  it('anexa o token da sessão como Bearer', async () => {
    const calls = fakeAdapter({ data: { id: 'a' }, headers: JSON_HEADERS })
    session.setToken('tok_123')
    await mod.request(Item, { url: '/x' })
    expect(calls[0].headers.get('Authorization')).toBe('Bearer tok_123')
  })

  it('SESSION_EXPIRED com token ativo encerra a sessão como expirada', async () => {
    fakeAdapter({ status: 401, data: { error: { code: 'SESSION_EXPIRED', message: 'Expirou' } } })
    session.setToken('tok_123')
    await expect(mod.request(Item, { url: '/x' })).rejects.toMatchObject({ code: 'SESSION_EXPIRED' })
    expect(session.getToken()).toBeNull()
    expect(session.isExpired()).toBe(true)
  })

  it('SESSION_EXPIRED sem token não dispara troca de sessão', async () => {
    const listener = vi.fn()
    session.subscribe(listener)
    fakeAdapter({ status: 401, data: { error: { code: 'SESSION_EXPIRED', message: 'Expirou' } } })
    await expect(mod.request(Item, { url: '/x' })).rejects.toMatchObject({ code: 'SESSION_EXPIRED' })
    expect(listener).not.toHaveBeenCalled()
    expect(session.isExpired()).toBe(false)
  })

  describe('resposta HTML (camada de rede que atende a API caiu)', () => {
    it('sem quem recupere: falha de rede, sem nova tentativa', async () => {
      const calls = fakeAdapter(HTML)
      await expect(mod.request(Item, { url: '/x' })).rejects.toMatchObject({ code: 'NETWORK_ERROR', status: null })
      expect(calls).toHaveLength(1)
    })

    it('GET: chama a recuperação e repete uma vez', async () => {
      const recovery = vi.fn(async () => {})
      mod.setNetworkRecovery(recovery)
      const calls = fakeAdapter(HTML, { data: { id: 'ok' }, headers: JSON_HEADERS })
      await expect(mod.request(Item, { url: '/x' })).resolves.toEqual({ id: 'ok' })
      expect(recovery).toHaveBeenCalledOnce()
      expect(calls).toHaveLength(2)
    })

    it('GET: se continuar vindo HTML, desiste depois de uma repetição', async () => {
      const recovery = vi.fn(async () => {})
      mod.setNetworkRecovery(recovery)
      const calls = fakeAdapter(HTML)
      await expect(mod.request(Item, { url: '/x' })).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
      expect(recovery).toHaveBeenCalledOnce()
      expect(calls).toHaveLength(2)
    })

    it.each(['post', 'PUT', 'patch', 'delete'])('%s: recupera a rede mas nunca repete a escrita', async (method) => {
      const recovery = vi.fn(async () => {})
      mod.setNetworkRecovery(recovery)
      const calls = fakeAdapter(HTML, { data: { id: 'ok' }, headers: JSON_HEADERS })
      await expect(mod.request(Item, { method, url: '/orders' })).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
      expect(recovery).toHaveBeenCalledOnce()
      expect(calls).toHaveLength(1)
    })

    it('recuperação que falha continua sendo ApiError de rede (e não repete)', async () => {
      mod.setNetworkRecovery(() => Promise.reject(new Error('worker não subiu')))
      const calls = fakeAdapter(HTML, { data: { id: 'ok' }, headers: JSON_HEADERS })
      const err = await mod.request(Item, { url: '/x' }).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(mod.ApiError)
      expect(err).toMatchObject({ code: 'NETWORK_ERROR' })
      expect(calls).toHaveLength(1)
    })
  })
})
