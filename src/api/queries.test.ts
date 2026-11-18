/**
 * Chaves e opções do TanStack Query: isolamento por dono (tudo que é privado sob ['private', <dono>]), retry que
 * não repete resposta definitiva, consulta periódica só enquanto o pedido está pendente e a sessão que se
 * limpa sozinha quando a API diz que ela acabou. As funções de consulta rodam contra os handlers MSW reais.
 */
import { setupServer } from 'msw/node'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryStorage } from '@/test/memory-storage'
import * as db from '@/mocks/db'
import { handlers } from '@/mocks/handlers'
import { setScenario } from '@/mocks/scenario'
import type { Order } from './contracts'
import { api } from './endpoints'
import { ApiError, http } from './http'
import { adminMeQuery, adminOrdersQuery, cartQuery, nftListQuery, orderQuery, qk, sessionQuery } from './queries'
import { sessionStore } from './session-store'

const ORIGIN = 'http://kurio.test'
const server = setupServer(...handlers)

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
  http.defaults.baseURL = `${ORIGIN}/api`
})
afterAll(() => server.close())

beforeEach(async () => {
  vi.stubGlobal('localStorage', createMemoryStorage())
  vi.stubGlobal('location', { href: `${ORIGIN}/`, origin: ORIGIN })
  setScenario({ latency: 'off', faults: [], payment: 'approve' })
  await db.resetDb()
  if (sessionStore.getToken()) sessionStore.clear('logout')
})

/** Chama a queryFn como o TanStack Query chamaria (com um signal). */
function run<T>(options: { queryKey: readonly unknown[]; queryFn?: unknown }) {
  const fn = options.queryFn as (ctx: { signal: AbortSignal; queryKey: readonly unknown[]; meta: undefined }) => Promise<T>
  return fn({ signal: new AbortController().signal, queryKey: options.queryKey, meta: undefined })
}

/** O que o TanStack Query passa para refetchInterval: só o estado com os dados. */
const withData = (data: unknown) => ({ state: { data } }) as never

describe('chaves (isolamento entre contas)', () => {
  it('tudo que é privado fica sob ["private", dono]: o logout remove ["private"] e nada sobra', () => {
    const privateKeys = [qk.favorites('u1'), qk.cart('u1'), qk.order('u1', 'o1'), qk.orders('u1'), qk.profile('u1'), qk.wallets('u1'), qk.admin('u1'), qk.adminMe('u1'), qk.adminOrders('u1', {})]
    for (const key of privateKeys) expect(key.slice(0, 2)).toEqual(['private', 'u1'])
    expect(qk.cart('guest')).toEqual(['private', 'guest', 'cart'])
    expect(qk.cart('u1')).not.toEqual(qk.cart('u2'))
  })

  it('a chave do catálogo leva todos os parâmetros: resposta de outra busca nunca cai na tela atual', () => {
    expect(qk.nftList({ q: 'a', page: 1 })).not.toEqual(qk.nftList({ q: 'a', page: 2 }))
    expect(nftListQuery({ q: 'ape' }).queryKey).toEqual(['nfts', 'list', { q: 'ape' }])
  })
})

describe('opções', () => {
  it('painel: 403 é resposta definitiva (não repete); falha de rede repete até 2 vezes', () => {
    const retry = adminMeQuery('u1').retry as (count: number, error: unknown) => boolean
    expect(retry(0, new ApiError({ code: 'FORBIDDEN', message: 'x', status: 403 }))).toBe(false)
    expect(retry(0, new ApiError({ code: 'NETWORK_ERROR', message: 'x', status: null }))).toBe(true)
    expect(retry(1, new ApiError({ code: 'TIMEOUT', message: 'x', status: null }))).toBe(true)
    expect(retry(2, new ApiError({ code: 'NETWORK_ERROR', message: 'x', status: null }))).toBe(false)
  })

  it('pedido: confere a cada 5 s só enquanto pendente; confirmado ou recusado para', () => {
    const interval = orderQuery('u1', 'o1').refetchInterval as (q: never) => number | false
    expect(interval(withData({ status: 'pending' } satisfies Partial<Order>))).toBe(5_000)
    expect(interval(withData({ status: 'confirmed' }))).toBe(false)
    expect(interval(withData({ status: 'rejected' }))).toBe(false)
    expect(interval(withData(undefined))).toBe(false)

    const admin = adminOrdersQuery('u1', {}).refetchInterval as (q: never) => number | false
    expect(admin(withData({ items: [{ status: 'confirmed' }, { status: 'pending' }] }))).toBe(5_000)
    expect(admin(withData({ items: [{ status: 'confirmed' }] }))).toBe(false)
  })
})

describe('funções de consulta contra a API simulada', () => {
  it('sessão: sem token é null sem chamar a API; token válido devolve a sessão', async () => {
    expect(await run(sessionQuery)).toBeNull()
    const session = await api.login({ email: 'ana@kurio.test', password: 'Selva2026!' })
    sessionStore.setToken(session.token)
    expect(await run(sessionQuery)).toMatchObject({ user: { email: 'ana@kurio.test' } })
  })

  it('sessão: token que a API não reconhece limpa a sessão guardada e devolve null', async () => {
    sessionStore.setToken('tok_inexistente')
    expect(await run(sessionQuery)).toBeNull()
    expect(sessionStore.getToken()).toBeNull()
  })

  it('catálogo e carrinho buscam pela API com o signal da consulta', async () => {
    const list = await run<{ items: unknown[] }>(nftListQuery({ pageSize: 2 }))
    expect(list.items).toHaveLength(2)
    const session = await api.login({ email: 'bruno@kurio.test', password: 'Pixel2026!' })
    sessionStore.setToken(session.token)
    expect(await run(cartQuery(session.user.id))).toMatchObject({ items: [] })
  })
})
