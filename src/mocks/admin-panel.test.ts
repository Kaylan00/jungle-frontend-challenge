/**
 * Endpoints novos do Kurio Admin pelos handlers REST de verdade (MSW em Node): /admin/me, /admin/overview,
 * /admin/activity, /admin/orders e /admin/users. Permissão (401/403), contrato (zod), números calculados no
 * servidor, ausência de dado sensível e o feed de atividade (com o evento admin.activity que o socket repassa).
 * As compras são feitas pela mesma API da loja (carrinho, carteira, cotação, pedido).
 */
import { setupServer } from 'msw/node'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminActivityEvent, AdminActivityList, AdminOrderListResponse, AdminOverview, AdminUserListResponse } from '@/api/admin-contracts'
import { User } from '@/api/contracts'
import { createMemoryStorage } from '@/test/memory-storage'
import * as db from './db'
import { handlers } from './handlers'
import { setScenario } from './scenario'

const ORIGIN = 'http://kurio.test'
const ADMIN = { email: 'admin@kurio.test', password: 'Kurio#Admin2026' }
const ANA = { email: 'ana@kurio.test', password: 'Selva2026!' }
const BRUNO = { email: 'bruno@kurio.test', password: 'Pixel2026!' }

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())

beforeEach(async () => {
  vi.stubGlobal('localStorage', createMemoryStorage())
  vi.stubGlobal('location', { href: `${ORIGIN}/` })
  setScenario({ latency: 'off', faults: [], payment: 'approve' })
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

/** Carteira principal da conta (cadastrada pela API se a seed não tiver nenhuma, como a do Bruno). */
async function primaryWallet(token: string, email: string) {
  const list = await call('GET', '/wallets', { token })
  if (list.body.items.length) return list.body.items[0]
  const created = await call('POST', '/wallets', {
    token,
    body: {
      role: 'primary',
      displayName: 'Colecionador',
      nickname: 'Principal',
      network: 'ethereum',
      profileName: 'colecionador',
      address: '0x1111111111111111111111111111111111111111',
      secondaryAddress: null,
      provider: 'metamask',
      referralCode: 'KURIO-2',
      email,
      ensName: 'colecionador',
    },
  })
  expect(created.status, JSON.stringify(created.body)).toBe(201)
  return created.body
}

/** Compra completa pela API da loja; devolve o número do pedido. */
async function buy(user: { email: string; password: string }, nftId: string, editionId: string, quantity = 1) {
  const token = await login(user)
  const wallet = await primaryWallet(token, user.email)
  expect((await call('POST', '/cart/items', { token, body: { nftId, editionId, quantity } })).status).toBeLessThan(300)
  expect((await call('POST', `/wallets/${wallet.id}/connect`, { token, body: { network: wallet.network } })).status).toBe(200)
  const quote = await call('POST', '/quotes', { token, body: { network: wallet.network, couponCode: null } })
  expect(quote.status).toBe(200)
  const order = await call('POST', '/orders', {
    token,
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    body: {
      quoteId: quote.body.id,
      fingerprint: quote.body.fingerprint,
      walletId: wallet.id,
      network: wallet.network,
      provider: wallet.provider,
      collector: { displayName: 'Colecionador', username: 'colecionador', profileName: 'colecionador', email: user.email, ensName: 'colecionador', referralCode: 'KURIO-1', note: '' },
    },
  })
  expect(order.status, JSON.stringify(order.body)).toBe(201)
  return order.body.number as string
}

/** O relógio dos pagamentos chega ao prazo (no navegador é o intervalo de mocks/browser.ts). */
function settleAll() {
  db.getState().orders.forEach((o) => (o.settleAt = 0))
  db.settleDueOrders()
}

describe('permissão das rotas novas', () => {
  const routes = ['/admin/me', '/admin/overview', '/admin/activity', '/admin/orders', '/admin/users']

  it('sem sessão: 401; conta comum: 403 FORBIDDEN com a mensagem da API', async () => {
    const token = await login(ANA)
    for (const path of routes) {
      expect(await call('GET', path)).toMatchObject({ status: 401, body: { error: { code: 'UNAUTHENTICATED' } } })
      expect(await call('GET', path, { token })).toMatchObject({ status: 403, body: { error: { code: 'FORBIDDEN', message: 'Esta área é só para administradores da Kurio.' } } })
    }
  })

  it('/admin/me devolve a conta admin no contrato público (sem hash nem salt)', async () => {
    const res = await call('GET', '/admin/me', { token: await login(ADMIN) })
    expect(res.status).toBe(200)
    expect(User.parse(res.body)).toMatchObject({ email: ADMIN.email, role: 'admin' })
    expect(res.body).not.toHaveProperty('passwordHash')
    expect(res.body).not.toHaveProperty('salt')
  })

  it('sessão expirada: 401 SESSION_EXPIRED', async () => {
    const token = await login(ADMIN)
    db.expireAllSessions()
    expect(await call('GET', '/admin/overview', { token })).toMatchObject({ status: 401, body: { error: { code: 'SESSION_EXPIRED' } } })
  })
})

describe('GET /admin/overview', () => {
  it('na seed: catálogo dividido sem sobra, nenhum pedido e receita zero', async () => {
    const res = await call('GET', '/admin/overview', { token: await login(ADMIN) })
    const o = AdminOverview.parse(res.body)
    expect(o.nfts.total).toBe(36)
    expect(o.nfts.onSale + o.nfts.soldOut + o.nfts.unavailable).toBe(36)
    expect(o.nfts.featured).toBe(db.getState().nfts.filter((n) => n.featured).length)
    expect(o.orders).toEqual({ total: 0, pending: 0, confirmed: 0, rejected: 0 })
    expect(o.revenue).toEqual({ confirmed: '0', pending: '0' })
    expect(o.users).toEqual({ total: 3, admins: 1 })
    expect(o.coupons.active).toBe(db.listCoupons().filter((c) => c.status === 'active').length)
  })

  it('acompanha pedidos (pendente → confirmado/recusado), receita e esgotados', async () => {
    const admin = await login(ADMIN)
    // nft-01 1/1 tem tiragem 1: comprar a única unidade esgota a edição.
    await buy(ANA, 'nft-02', 'nft-02-ed-2')
    let o = AdminOverview.parse((await call('GET', '/admin/overview', { token: admin })).body)
    expect(o.orders).toMatchObject({ total: 1, pending: 1 })
    expect(o.revenue).toEqual({ confirmed: '0', pending: '0.966' })

    settleAll()
    setScenario({ payment: 'reject' })
    await buy(BRUNO, 'nft-02', 'nft-02-ed-2')
    settleAll()
    o = AdminOverview.parse((await call('GET', '/admin/overview', { token: admin })).body)
    expect(o.orders).toEqual({ total: 2, pending: 0, confirmed: 1, rejected: 1 })
    expect(o.revenue).toEqual({ confirmed: '0.966', pending: '0' })

    const before = o.nfts.soldOut
    for (const e of db.findNft('nft-05')!.editions) {
      expect((await call('PATCH', `/admin/nfts/nft-05/editions/${e.id}`, { token: admin, body: { version: db.findNft('nft-05')!.version, available: 0 } })).status).toBe(200)
    }
    o = AdminOverview.parse((await call('GET', '/admin/overview', { token: admin })).body)
    expect(o.nfts.soldOut).toBe(before + 1)
  })
})

describe('GET /admin/orders', () => {
  it('lista os pedidos de todas as contas, do mais novo ao mais antigo, sem os dados do colecionador', async () => {
    const first = await buy(ANA, 'nft-02', 'nft-02-ed-2', 2)
    const second = await buy(BRUNO, 'nft-05', 'nft-05-ed-2')
    const res = await call('GET', '/admin/orders', { token: await login(ADMIN) })
    const list = AdminOrderListResponse.parse(res.body)
    expect(list.items.map((o) => o.number)).toEqual([second, first])
    expect(list.items[1]).toMatchObject({ status: 'pending', customer: { username: 'ana_nft', name: 'Ana Colecionadora' }, lines: [{ nftId: 'nft-02', quantity: 2 }] })
    expect(list.counts).toEqual({ all: 2, pending: 2, confirmed: 0, rejected: 0 })
    // Nada do perfil do colecionador nem da carteira vai para o painel.
    const raw = JSON.stringify(res.body)
    for (const leak of ['collector', 'ana@kurio.test', 'bruno@kurio.test', 'wallet', 'KURIO-1']) expect(raw).not.toContain(leak)
  })

  it('filtra por status e busca por número ou cliente; a contagem por status segue a busca', async () => {
    const admin = await login(ADMIN)
    const anaOrder = await buy(ANA, 'nft-02', 'nft-02-ed-2')
    settleAll()
    await buy(BRUNO, 'nft-05', 'nft-05-ed-2')

    const confirmed = AdminOrderListResponse.parse((await call('GET', '/admin/orders?status=confirmed', { token: admin })).body)
    expect(confirmed.items.map((o) => o.number)).toEqual([anaOrder])
    expect(confirmed.counts).toEqual({ all: 2, pending: 1, confirmed: 1, rejected: 0 })

    const byUser = AdminOrderListResponse.parse((await call('GET', '/admin/orders?q=bruno', { token: admin })).body)
    expect(byUser.items.map((o) => o.customer.username)).toEqual(['bruno_pixel'])
    expect(byUser.counts.all).toBe(1)
    const byNumber = AdminOrderListResponse.parse((await call('GET', `/admin/orders?q=${anaOrder.toLowerCase()}`, { token: admin })).body)
    expect(byNumber.items.map((o) => o.number)).toEqual([anaOrder])
  })

  it('pagina e valida os parâmetros (422 por campo)', async () => {
    const admin = await login(ADMIN)
    await buy(ANA, 'nft-02', 'nft-02-ed-2')
    await buy(BRUNO, 'nft-05', 'nft-05-ed-2')
    await buy(ANA, 'nft-04', 'nft-04-ed-2')
    const page2 = AdminOrderListResponse.parse((await call('GET', '/admin/orders?pageSize=2&page=2', { token: admin })).body)
    expect(page2).toMatchObject({ page: 2, pageSize: 2, total: 3, totalPages: 2 })
    expect(page2.items).toHaveLength(1)
    // Página além do fim cai na última (como /admin/nfts).
    expect((await call('GET', '/admin/orders?pageSize=2&page=9', { token: admin })).body.page).toBe(2)
    for (const [query, field] of [
      ['status=enviado', 'status'],
      ['pageSize=99', 'pageSize'],
      ['page=0', 'page'],
    ]) {
      const res = await call('GET', `/admin/orders?${query}`, { token: admin })
      expect(res.status, query).toBe(422)
      expect(res.body.error.fields).toHaveProperty(field)
    }
  })
})

describe('GET /admin/users', () => {
  it('somente leitura e sem dado sensível: e-mail mascarado, contagem de pedidos e favoritos', async () => {
    await buy(ANA, 'nft-02', 'nft-02-ed-2')
    const res = await call('GET', '/admin/users', { token: await login(ADMIN) })
    const list = AdminUserListResponse.parse(res.body)
    expect(list.total).toBe(3)
    expect(list.items[0]).toMatchObject({ username: 'kurio_admin', role: 'admin', emailMasked: 'a***@kurio.test' })
    expect(list.items.find((u) => u.username === 'ana_nft')).toMatchObject({ orders: 1, favorites: 2, emailMasked: 'a***@kurio.test', role: 'user' })
    const raw = JSON.stringify(res.body)
    for (const leak of ['ana@kurio.test', 'passwordHash', 'salt', 'wallets', 'avatarUrl', 'ensName']) expect(raw).not.toContain(leak)
    expect((await call('PUT', '/admin/users', { token: await login(ADMIN) })).status).toBe(404)
  })

  it('busca por nome ou nome de usuário (sem acento) e pagina', async () => {
    const admin = await login(ADMIN)
    const found = AdminUserListResponse.parse((await call('GET', '/admin/users?q=COLECIONADORA', { token: admin })).body)
    expect(found.items.map((u) => u.username)).toEqual(['ana_nft'])
    const page = AdminUserListResponse.parse((await call('GET', '/admin/users?pageSize=2&page=2', { token: admin })).body)
    expect(page).toMatchObject({ page: 2, total: 3, totalPages: 2 })
    expect((await call('GET', '/admin/users?pageSize=0', { token: admin })).status).toBe(422)
  })
})

describe('GET /admin/activity e o evento admin.activity', () => {
  it('registra preço, destaque, cupom e o ciclo do pedido, do mais recente ao mais antigo', async () => {
    const admin = await login(ADMIN)
    const events: AdminActivityEvent[] = []
    const off = db.onDbEvent((e) => {
      if (e.type === 'admin.activity') events.push(AdminActivityEvent.parse(e))
    })

    await call('PATCH', '/admin/nfts/nft-01/editions/nft-01-ed-3', { token: admin, body: { version: 1, price: '0.99' } })
    await call('PATCH', '/admin/nfts/nft-04', { token: admin, body: { version: 1, featured: true } })
    await call('POST', '/admin/coupons', { token: admin, body: { code: 'VERAO15', kind: 'percent', value: '15', expiresAt: null } })
    const number = await buy(ANA, 'nft-02', 'nft-02-ed-2')
    settleAll()
    await call('POST', '/admin/coupons/VERAO15/deactivate', { token: admin })
    off()

    const feed = AdminActivityList.parse((await call('GET', '/admin/activity', { token: admin })).body).items
    expect(feed.map((a) => a.kind)).toEqual(['coupon.deactivated', 'order.confirmed', 'order.created', 'coupon.created', 'nft.featured', 'nft.price'])
    expect(feed.find((a) => a.kind === 'nft.price')).toMatchObject({ title: 'Preço alterado: Emerald Ape #042 · edição 1/50', detail: '1.19 ETH → 0.99 ETH', resource: { type: 'nft', id: 'nft-01' } })
    expect(feed.find((a) => a.kind === 'order.created')).toMatchObject({ title: `Pedido ${number} recebido`, detail: 'ana_nft · 1 item · 0.966 ETH · Ethereum' })
    // O feed não carrega e-mail nem endereço de carteira.
    expect(JSON.stringify(feed)).not.toMatch(/@kurio\.test|0x[0-9a-f]{8}/i)
    // Cada linha saiu também como evento (o socket repassa só às conexões de admin), com o mesmo conteúdo.
    expect(events.map((e) => e.activity).reverse()).toEqual(feed)

    // Desativar de novo (idempotente) não gera linha nova; limite validado.
    await call('POST', '/admin/coupons/VERAO15/deactivate', { token: admin })
    expect(AdminActivityList.parse((await call('GET', '/admin/activity?limit=2', { token: admin })).body).items.map((a) => a.kind)).toEqual(['coupon.deactivated', 'order.confirmed'])
    expect((await call('GET', '/admin/activity?limit=0', { token: admin })).status).toBe(422)
    expect((await call('GET', `/admin/activity?limit=${db.ACTIVITY_MAX + 1}`, { token: admin })).status).toBe(422)
  })

  it('estoque e status: esgotar pelo estoque é uma linha só; tirar de venda é a escolha do painel', async () => {
    const admin = await login(ADMIN)
    await call('PATCH', '/admin/nfts/nft-01/editions/nft-01-ed-3', { token: admin, body: { version: 1, available: 0, status: 'on_sale' } })
    await call('PATCH', '/admin/nfts/nft-01/editions/nft-01-ed-2', { token: admin, body: { version: 2, status: 'unavailable' } })
    const feed = AdminActivityList.parse((await call('GET', '/admin/activity', { token: admin })).body).items
    expect(feed.map((a) => [a.kind, a.detail])).toEqual([
      ['nft.status', 'à venda → indisponível'],
      ['nft.stock', '18 → 0 de 50'],
    ])
  })

  it('o feed guarda no máximo ACTIVITY_MAX linhas', async () => {
    const admin = await login(ADMIN)
    for (let i = 0; i < db.ACTIVITY_MAX + 5; i++) {
      await call('PATCH', '/admin/nfts/nft-04', { token: admin, body: { version: db.findNft('nft-04')!.version, featured: i % 2 === 0 } })
    }
    expect(db.getState().activity).toHaveLength(db.ACTIVITY_MAX)
    expect(AdminActivityList.parse((await call('GET', `/admin/activity?limit=${db.ACTIVITY_MAX}`, { token: admin })).body).items).toHaveLength(db.ACTIVITY_MAX)
  })
})
