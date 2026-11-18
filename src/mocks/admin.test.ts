/**
 * Painel admin no servidor simulado, pelos handlers REST de verdade (MSW em Node): permissão (401/403),
 * validação (422 por campo), conflito de versão (409 com o estado atual), eventos emitidos e cupons valendo
 * no carrinho. Nada aqui chama o db por fora para "fazer passar": as requisições são as mesmas do app.
 */
import { setupServer } from 'msw/node'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminNftListResponse, NftDetail, NftUpdatedEvent } from '@/api/contracts'
import { createMemoryStorage } from '@/test/memory-storage'
import * as db from './db'
import { handlers } from './handlers'
import { setScenario } from './scenario'

const ORIGIN = 'http://kurio.test'
const ADMIN = { email: 'admin@kurio.test', password: 'Kurio#Admin2026' }
const ANA = { email: 'ana@kurio.test', password: 'Selva2026!' }

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())

beforeEach(async () => {
  vi.stubGlobal('localStorage', createMemoryStorage())
  // Os handlers usam caminhos relativos (/api/...): em Node o MSW os resolve contra `location`.
  vi.stubGlobal('location', { href: `${ORIGIN}/` })
  setScenario({ latency: 'off', faults: [] })
  await db.resetDb()
})

async function call(method: string, path: string, opts: { token?: string; body?: unknown } = {}) {
  const res = await fetch(`${ORIGIN}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) },
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

async function adminNft(token: string, id: string) {
  const res = await call('GET', `/admin/nfts?q=${id}`, { token })
  return AdminNftListResponse.parse(res.body).items.find((n) => n.id === id)!
}

function collectEvents() {
  const events: NftUpdatedEvent[] = []
  const off = db.onDbEvent((e) => {
    if (e.type === 'nft.updated') events.push(e)
  })
  return { events, off }
}

describe('permissão', () => {
  const routes: Array<[string, string, unknown?]> = [
    ['GET', '/admin/nfts'],
    ['PATCH', '/admin/nfts/nft-01', { version: 1, featured: false }],
    ['PATCH', '/admin/nfts/nft-01/editions/nft-01-ed-3', { version: 1, price: '0.5' }],
    ['GET', '/admin/coupons'],
    ['POST', '/admin/coupons', { code: 'HACK50', kind: 'percent', value: '50', expiresAt: null }],
    ['POST', '/admin/coupons/KURIO10/deactivate'],
  ]

  it('sem sessão: 401 em todas as rotas do painel', async () => {
    for (const [method, path, body] of routes) {
      expect(await call(method, path, { body })).toMatchObject({ status: 401, body: { error: { code: 'UNAUTHENTICATED' } } })
    }
  })

  it('conta comum: 403 FORBIDDEN em todas as rotas, sem mudar nada', async () => {
    const token = await login(ANA)
    for (const [method, path, body] of routes) {
      expect(await call(method, path, { token, body })).toMatchObject({ status: 403, body: { error: { code: 'FORBIDDEN' } } })
    }
    expect(db.findNft('nft-01')).toMatchObject({ version: 1, featured: true, price: '1.19' })
    expect(db.checkCoupon('KURIO10').ok).toBe(true)
    expect(db.checkCoupon('HACK50').ok).toBe(false)
  })

  it('admin: 200 e o papel vem na sessão', async () => {
    const token = await login(ADMIN)
    const session = await call('GET', '/auth/session', { token })
    expect(session.body.user).toMatchObject({ email: ADMIN.email, role: 'admin' })
    const list = await call('GET', '/admin/nfts?pageSize=5', { token })
    expect(list.status).toBe(200)
    expect(AdminNftListResponse.parse(list.body)).toMatchObject({ total: 36, totalPages: 8, page: 1 })
  })

  it('cadastro público nunca cria admin (o papel do corpo é ignorado)', async () => {
    const signup = await call('POST', '/auth/signup', { body: { username: 'espertinho', email: 'esperto@kurio.test', password: 'Senha2026x', role: 'admin' } })
    expect(signup.status).toBe(201)
    expect(signup.body.user.role).toBe('user')
    expect((await call('GET', '/admin/coupons', { token: signup.body.token })).status).toBe(403)
  })

  it('sessão expirada no painel: 401 SESSION_EXPIRED (o app leva ao login)', async () => {
    const token = await login(ADMIN)
    db.expireAllSessions()
    expect(await call('GET', '/admin/nfts', { token })).toMatchObject({ status: 401, body: { error: { code: 'SESSION_EXPIRED' } } })
  })
})

describe('edição de edições', () => {
  it('valida no servidor: preço, disponibilidade (até a tiragem) e status', async () => {
    const token = await login(ADMIN)
    const path = '/admin/nfts/nft-01/editions/nft-01-ed-3'
    const cases: Array<[unknown, string]> = [
      [{ version: 1, price: '1,50' }, 'price'],
      [{ version: 1, price: '0' }, 'price'],
      [{ version: 1, price: '-1' }, 'price'],
      [{ version: 1, price: '1.1234567890123456789' }, 'price'],
      [{ version: 1, available: -1 }, 'available'],
      [{ version: 1, available: 2.5 }, 'available'],
      [{ version: 1, available: 51 }, 'available'],
      [{ version: 1, status: 'sold_out' }, 'status'],
      [{ price: '1.5' }, 'version'],
    ]
    for (const [body, field] of cases) {
      const res = await call('PATCH', path, { token, body })
      expect(res.status, JSON.stringify(body)).toBe(422)
      expect(res.body.error.fields).toHaveProperty(field)
    }
    expect(db.findNft('nft-01')).toMatchObject({ version: 1, price: '1.19' })
  })

  it('grava, recalcula o NFT e os carrinhos, e emite nft.updated com a mesma versão', async () => {
    const token = await login(ADMIN)
    const cart = db.getOrCreateCart({ userId: 'usr-ana', guestCartId: null })
    db.addCartItem(cart, 'nft-01', 'nft-01-ed-3', 1)
    const cartVersion = cart.version
    const { events, off } = collectEvents()

    const res = await call('PATCH', '/admin/nfts/nft-01/editions/nft-01-ed-3', { token, body: { version: 1, price: '0.990', available: 10 } })
    off()
    expect(res.status).toBe(200)
    const nft = NftDetail.parse(res.body)
    expect(nft).toMatchObject({ version: 2, price: '0.99' })
    expect(nft.editions.find((e) => e.id === 'nft-01-ed-3')).toMatchObject({ price: '0.99', available: 10, status: 'on_sale' })

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ version: 2, resource: { id: 'nft-01' }, data: { price: '0.99', previousPrice: '1.19', featured: true } })
    // Carrinho com o NFT: versão nova e item acusando o preço novo.
    expect(cart.version).toBeGreaterThan(cartVersion)
    expect(db.serializeCart(db.getOrCreateCart({ userId: 'usr-ana', guestCartId: null })).items[0]).toMatchObject({ unitPrice: '0.99', issue: 'price_changed' })
  })

  it('status: indisponível tira de venda mesmo com estoque; à venda com 0 fica esgotada', async () => {
    const token = await login(ADMIN)
    const path = '/admin/nfts/nft-02/editions/nft-02-ed-2'
    let res = await call('PATCH', path, { token, body: { version: 1, status: 'unavailable' } })
    expect(res.body.editions[1]).toMatchObject({ status: 'unavailable', available: 22 })
    expect(res.body.price).toBe('1.69') // a edição mais barata saiu de venda
    res = await call('PATCH', path, { token, body: { version: 2, status: 'on_sale', available: 0 } })
    expect(res.body.editions[1]).toMatchObject({ status: 'sold_out', available: 0 })
    res = await call('PATCH', path, { token, body: { version: 3, available: 5 } })
    expect(res.body.editions[1]).toMatchObject({ status: 'on_sale', available: 5 })
  })

  it('409 quando o NFT mudou desde a leitura (outra aba ou uma compra), com o estado atual e sem gravar', async () => {
    const token = await login(ADMIN)
    const read = await adminNft(token, 'nft-01')
    // Outra aba/admin grava antes.
    const first = await call('PATCH', '/admin/nfts/nft-01/editions/nft-01-ed-3', { token, body: { version: read.version, price: '1.30' } })
    expect(first.status).toBe(200)
    const { events, off } = collectEvents()
    // Esta aba ainda tem a versão antiga.
    const stale = await call('PATCH', '/admin/nfts/nft-01/editions/nft-01-ed-3', { token, body: { version: read.version, price: '0.50' } })
    off()
    expect(stale.status).toBe(409)
    expect(stale.body.error).toMatchObject({ code: 'CONFLICT', details: { reason: 'VERSION_MISMATCH', current: { id: 'nft-01', version: read.version + 1 } } })
    expect(db.findNft('nft-01')?.editions[2].price).toBe('1.3')
    expect(events).toHaveLength(0)

    // Mudança que não veio do painel (ex.: estoque reservado por uma compra) também conta.
    db.updateEdition('nft-01', 'nft-01-ed-2', { available: 3 })
    const afterPurchase = await call('PATCH', '/admin/nfts/nft-01', { token, body: { version: read.version + 1, featured: false } })
    expect(afterPurchase.status).toBe(409)
    expect(db.findNft('nft-01')?.featured).toBe(true)
  })

  it('destaque: grava com a versão lida e emite featured no evento', async () => {
    const token = await login(ADMIN)
    const { events, off } = collectEvents()
    const res = await call('PATCH', '/admin/nfts/nft-04', { token, body: { version: 1, featured: true } })
    off()
    expect(res).toMatchObject({ status: 200, body: { featured: true, version: 2 } })
    expect(events[0]).toMatchObject({ version: 2, data: { featured: true } })
    const featured = await call('GET', '/nfts/featured')
    expect(featured.body.items.map((n: { id: string }) => n.id)).toContain('nft-04')
  })

  it('404 para NFT ou edição inexistente', async () => {
    const token = await login(ADMIN)
    expect((await call('PATCH', '/admin/nfts/nft-99/editions/x', { token, body: { version: 1, price: '1' } })).status).toBe(404)
    expect((await call('PATCH', '/admin/nfts/nft-01/editions/x', { token, body: { version: 1, price: '1' } })).status).toBe(404)
  })
})

describe('cupons', () => {
  const future = '2099-01-01T23:59:59.000Z'

  it('cria percentual e valor fixo; valida código, valor e validade; código repetido dá 409', async () => {
    const token = await login(ADMIN)
    const ok = await call('POST', '/admin/coupons', { token, body: { code: ' verao15 ', kind: 'percent', value: '15', expiresAt: future } })
    expect(ok).toMatchObject({ status: 201, body: { code: 'VERAO15', kind: 'percent', value: '15', status: 'active', description: '15% de desconto' } })
    expect((await call('POST', '/admin/coupons', { token, body: { code: 'PIX', kind: 'fixed', value: '0.05', expiresAt: null } })).body).toMatchObject({ code: 'PIX', value: '0.05' })

    const invalid: Array<[unknown, string]> = [
      [{ code: 'A', kind: 'percent', value: '10', expiresAt: null }, 'code'],
      [{ code: 'COM ESPACO', kind: 'percent', value: '10', expiresAt: null }, 'code'],
      [{ code: 'MUITO', kind: 'percent', value: '101', expiresAt: null }, 'value'],
      [{ code: 'MUITO', kind: 'percent', value: '0', expiresAt: null }, 'value'],
      [{ code: 'MUITO', kind: 'percent', value: '10.555', expiresAt: null }, 'value'],
      [{ code: 'MUITO', kind: 'fixed', value: '1,5', expiresAt: null }, 'value'],
      [{ code: 'MUITO', kind: 'fixed', value: '0', expiresAt: null }, 'value'],
      [{ code: 'MUITO', kind: 'fixed', value: '0.1', expiresAt: 'amanhã' }, 'expiresAt'],
      [{ code: 'MUITO', kind: 'fixed', value: '0.1', expiresAt: '2020-01-01T00:00:00.000Z' }, 'expiresAt'],
      [{ code: 'MUITO', kind: 'outro', value: '0.1', expiresAt: null }, 'kind'],
    ]
    for (const [body, field] of invalid) {
      const res = await call('POST', '/admin/coupons', { token, body })
      expect(res.status, JSON.stringify(body)).toBe(422)
      expect(res.body.error.fields).toHaveProperty(field)
    }
    const dup = await call('POST', '/admin/coupons', { token, body: { code: 'kurio10', kind: 'percent', value: '5', expiresAt: null } })
    expect(dup).toMatchObject({ status: 409, body: { error: { code: 'CONFLICT', fields: { code: expect.any(String) } } } })
  })

  it('o carrinho respeita: percentual, valor fixo limitado ao subtotal e desativação', async () => {
    const admin = await login(ADMIN)
    await call('POST', '/admin/coupons', { token: admin, body: { code: 'MEIO', kind: 'fixed', value: '0.5', expiresAt: null } })
    await call('POST', '/admin/coupons', { token: admin, body: { code: 'GIGANTE', kind: 'fixed', value: '100', expiresAt: null } })
    const ana = await login(ANA)
    await call('POST', '/cart/items', { token: ana, body: { nftId: 'nft-02', editionId: 'nft-02-ed-2', quantity: 1 } }) // 0.95

    let cart = await call('POST', '/cart/coupon', { token: ana, body: { code: 'meio' } })
    expect(cart.body).toMatchObject({ coupon: { code: 'MEIO', amountOff: '0.5', percentOff: null }, summary: { subtotal: '0.95', discount: '0.5', total: '0.466' } })
    cart = await call('POST', '/cart/coupon', { token: ana, body: { code: 'GIGANTE' } })
    expect(cart.body.summary).toMatchObject({ discount: '0.95', total: '0.016' })

    // Cotação aberta com o cupom: desativar descarta a cotação; o pedido não sai com o desconto antigo.
    const quote = await call('POST', '/quotes', { token: ana, body: { network: 'ethereum', couponCode: 'GIGANTE' } })
    expect(quote.status).toBe(200)
    const off = await call('POST', '/admin/coupons/gigante/deactivate', { token: admin })
    expect(off).toMatchObject({ status: 200, body: { code: 'GIGANTE', active: false, status: 'inactive' } })
    expect(db.findQuote(quote.body.id)).toBeUndefined()

    cart = await call('GET', '/cart', { token: ana })
    expect(cart.body).toMatchObject({ coupon: null, summary: { discount: '0' } })
    const again = await call('POST', '/cart/coupon', { token: ana, body: { code: 'GIGANTE' } })
    expect(again).toMatchObject({ status: 422, body: { error: { code: 'COUPON_INVALID', message: 'Este cupom foi desativado' } } })
    expect((await call('POST', '/quotes', { token: ana, body: { network: 'ethereum', couponCode: 'GIGANTE' } })).status).toBe(422)
    // Desativar de novo é idempotente; cupom inexistente é 404.
    expect((await call('POST', '/admin/coupons/GIGANTE/deactivate', { token: admin })).status).toBe(200)
    expect((await call('POST', '/admin/coupons/NAOEXISTE/deactivate', { token: admin })).status).toBe(404)
  })

  it('lista com o status calculado no relógio do servidor', async () => {
    const token = await login(ADMIN)
    const res = await call('GET', '/admin/coupons', { token })
    const byCode = Object.fromEntries(res.body.items.map((c: { code: string; status: string }) => [c.code, c.status]))
    expect(byCode).toEqual({ BLACK2025: 'expired', GENESIS25: 'active', KURIO10: 'active' })
  })
})
