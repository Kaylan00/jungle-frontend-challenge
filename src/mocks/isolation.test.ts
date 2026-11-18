/**
 * Isolamento entre contas no servidor simulado, pelos handlers REST de verdade (MSW em Node): um usuário nunca
 * lê nem altera pedido, carteira, favoritos ou carrinho de outro, nem trocando o id na URL (IDOR), nem
 * reaproveitando a chave de idempotência, nem pelo id do carrinho. Também cobre ids hostis ("__proto__").
 */
import { setupServer } from 'msw/node'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryStorage } from '@/test/memory-storage'
import * as db from './db'
import { handlers } from './handlers'
import { setScenario } from './scenario'

const ORIGIN = 'http://kurio.test'
const ANA = { email: 'ana@kurio.test', password: 'Selva2026!' }
const BRUNO = { email: 'bruno@kurio.test', password: 'Pixel2026!' }
const COLLECTOR = { displayName: 'Ana', username: 'ana_nft', profileName: 'ana.kurio', email: 'ana@kurio.test', ensName: 'ana-kurio', referralCode: 'KURIO-ANA', note: '' }

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())

beforeEach(async () => {
  vi.stubGlobal('localStorage', createMemoryStorage())
  vi.stubGlobal('location', { href: `${ORIGIN}/` })
  setScenario({ latency: 'off', faults: [] })
  await db.resetDb()
})

async function call(method: string, path: string, opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const res = await fetch(`${ORIGIN}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}), ...opts.headers },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

async function login(user: { email: string; password: string }) {
  const res = await call('POST', '/auth/login', { body: user })
  expect(res.status).toBe(200)
  return res.body.token as string
}

/** Pedido da Ana pelo fluxo completo da API: carrinho → cotação → carteira conectada → pedido. */
async function anaOrder(token: string, key = 'chave-ana-1') {
  expect((await call('POST', '/cart/items', { token, body: { nftId: 'nft-01', editionId: 'nft-01-ed-3', quantity: 1 } })).status).toBe(201)
  const quote = await call('POST', '/quotes', { token, body: { network: 'ethereum', couponCode: null } })
  expect(quote.status).toBe(200)
  expect((await call('POST', '/wallets/wal-ana-1/connect', { token, body: { network: 'ethereum' } })).status).toBe(200)
  const body = { quoteId: quote.body.id, fingerprint: quote.body.fingerprint, walletId: 'wal-ana-1', network: 'ethereum', provider: 'metamask', collector: COLLECTOR }
  const order = await call('POST', '/orders', { token, body, headers: { 'Idempotency-Key': key } })
  expect(order.status).toBe(201)
  return { order: order.body, body }
}

describe('pedidos', () => {
  it('outra conta não lê o pedido pelo id nem o vê na lista', async () => {
    const ana = await login(ANA)
    const { order } = await anaOrder(ana)
    const bruno = await login(BRUNO)

    const direct = await call('GET', `/orders/${order.id}`, { token: bruno })
    expect([403, 404]).toContain(direct.status)
    expect(JSON.stringify(direct.body)).not.toContain(order.number)

    const list = await call('GET', '/orders', { token: bruno })
    expect(list.status).toBe(200)
    expect(list.body.items).toEqual([])
    expect((await call('GET', `/orders/${order.id}`)).status).toBe(401)
  })

  it('a chave de idempotência é por conta: a mesma chave de outra pessoa não devolve o pedido dela', async () => {
    const ana = await login(ANA)
    const { order, body } = await anaOrder(ana, 'chave-compartilhada')
    const bruno = await login(BRUNO)
    const res = await call('POST', '/orders', { token: bruno, body, headers: { 'Idempotency-Key': 'chave-compartilhada' } })
    expect(res.status).toBe(422)
    expect(JSON.stringify(res.body)).not.toContain(order.id)
  })

  it('a cotação de uma conta não serve para outra', async () => {
    const ana = await login(ANA)
    await call('POST', '/cart/items', { token: ana, body: { nftId: 'nft-01', editionId: 'nft-01-ed-3', quantity: 1 } })
    const quote = await call('POST', '/quotes', { token: ana, body: { network: 'ethereum', couponCode: null } })
    expect(db.findQuote(quote.body.id)?.userId).toBe('usr-ana')
    // Bruno não tem carteira: nem chega a usar a cotação; e a cotação continua sendo da Ana.
    const bruno = await login(BRUNO)
    const res = await call('POST', '/orders', {
      token: bruno,
      headers: { 'Idempotency-Key': 'k-bruno' },
      body: { quoteId: quote.body.id, fingerprint: quote.body.fingerprint, walletId: 'wal-ana-1', network: 'ethereum', provider: 'metamask', collector: COLLECTOR },
    })
    expect(res.status).toBe(422)
    expect(res.body.error.fields).toHaveProperty('walletId')
    expect(db.getState().orders).toHaveLength(0)
  })
})

describe('carteiras e favoritos', () => {
  it('carteira de outra conta: 404 para editar e conectar, sem mudar nada', async () => {
    const bruno = await login(BRUNO)
    const before = JSON.stringify(db.getWallets('usr-ana'))
    const wallet = { role: 'primary', displayName: 'Bruno', nickname: 'Roubada', network: 'ethereum', profileName: 'bruno.kurio', address: `0x${'b'.repeat(40)}`, secondaryAddress: null, provider: 'metamask', referralCode: 'BRUNO-1', email: 'bruno@kurio.test', ensName: 'bruno-pixel' }
    expect((await call('PUT', '/wallets/wal-ana-1', { token: bruno, body: wallet })).status).toBe(404)
    expect((await call('POST', '/wallets/wal-ana-1/connect', { token: bruno, body: { network: 'ethereum' } })).status).toBe(404)
    expect(JSON.stringify(db.getWallets('usr-ana'))).toBe(before)
    expect((await call('GET', '/wallets', { token: bruno })).body.items).toEqual([])
  })

  it('favoritos são da sessão: cada conta lê e altera só a própria lista', async () => {
    const ana = await login(ANA)
    const bruno = await login(BRUNO)
    const anaBefore = (await call('GET', '/favorites', { token: ana })).body.nftIds as string[]
    expect(anaBefore.length).toBeGreaterThan(0)
    // Bruno "remove" um favorito da Ana: só mexe na lista dele.
    await call('DELETE', `/favorites/${anaBefore[0]}`, { token: bruno })
    expect((await call('GET', '/favorites', { token: ana })).body.nftIds).toEqual(anaBefore)
  })
})

describe('carrinho', () => {
  it('o id do carrinho de visitante é aleatório (128 bits), não sequencial', async () => {
    const a = await call('GET', '/cart')
    const b = await call('GET', '/cart')
    expect(a.body.id).toMatch(/^guest-[a-f0-9]{32}$/)
    expect(b.body.id).not.toBe(a.body.id)
  })

  it('X-Cart-Id com o id do carrinho de uma conta não abre esse carrinho', async () => {
    const ana = await login(ANA)
    await call('POST', '/cart/items', { token: ana, body: { nftId: 'nft-01', editionId: 'nft-01-ed-3', quantity: 1 } })
    const anaCart = (await call('GET', '/cart', { token: ana })).body
    const asGuest = await call('GET', '/cart', { headers: { 'X-Cart-Id': anaCart.id } })
    expect(asGuest.status).toBe(200)
    expect(asGuest.body.id).not.toBe(anaCart.id)
    expect(asGuest.body.items).toEqual([])
  })

  it('juntar o carrinho de outra conta (cart/merge) não move nada', async () => {
    const ana = await login(ANA)
    await call('POST', '/cart/items', { token: ana, body: { nftId: 'nft-01', editionId: 'nft-01-ed-3', quantity: 1 } })
    const anaCart = (await call('GET', '/cart', { token: ana })).body
    const bruno = await login(BRUNO)
    const merged = await call('POST', '/cart/merge', { token: bruno, body: { guestCartId: anaCart.id } })
    expect(merged.status).toBe(200)
    expect(merged.body.items).toEqual([])
    expect((await call('GET', '/cart', { token: ana })).body.items).toHaveLength(1)
  })

  it('ids hostis ("__proto__", "constructor") não viram carrinho nem cotação, e o protótipo fica intacto', async () => {
    for (const id of ['__proto__', 'constructor', 'hasOwnProperty']) {
      const res = await call('POST', '/cart/items', { headers: { 'X-Cart-Id': id }, body: { nftId: 'nft-01', editionId: 'nft-01-ed-3', quantity: 1 } })
      expect(res.status).toBe(201)
      expect(res.body.id).toMatch(/^guest-/)
      expect(db.findQuote(id)).toBeUndefined()
    }
    const bruno = await login(BRUNO)
    expect((await call('POST', '/cart/merge', { token: bruno, body: { guestCartId: '__proto__' } })).status).toBe(200)
    expect(({} as Record<string, unknown>).version).toBeUndefined()
    expect(({} as Record<string, unknown>).items).toBeUndefined()
  })

  it('corpos fora do contrato são recusados com 422 (quantidade, cupom, merge)', async () => {
    const cart = (await call('POST', '/cart/items', { body: { nftId: 'nft-01', editionId: 'nft-01-ed-3', quantity: 1 } })).body
    const headers = { 'X-Cart-Id': cart.id }
    const itemId = cart.items[0].id
    for (const quantity of [0, -1, 1.5, '2', null]) {
      expect((await call('PATCH', `/cart/items/${itemId}`, { headers, body: { quantity } })).status).toBe(422)
    }
    for (const code of ['', '   ', 42, 'X'.repeat(41)]) {
      const res = await call('POST', '/cart/coupon', { headers, body: { code } })
      expect(res.status).toBe(422)
      expect(res.body.error.fields).toHaveProperty('code')
    }
    const bruno = await login(BRUNO)
    expect((await call('POST', '/cart/merge', { token: bruno, body: { guestCartId: { $ne: null } } })).status).toBe(422)
  })
})
