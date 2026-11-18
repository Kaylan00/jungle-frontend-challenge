/**
 * Cliente REST de ponta a ponta em Node: cada função de `api` passa pelo Axios de verdade (interceptors, token,
 * X-Cart-Id), pelos handlers MSW de verdade e pelos contratos zod. Nada é simulado do lado do cliente: se uma
 * rota, um método, um cabeçalho ou um contrato divergir entre o cliente e a API, o teste quebra aqui.
 */
import { setupServer } from 'msw/node'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryStorage } from '@/test/memory-storage'
import * as db from '@/mocks/db'
import { handlers } from '@/mocks/handlers'
import { setScenario } from '@/mocks/scenario'
import { api, nftListQueryString } from './endpoints'
import { ApiError, http } from './http'
import { sessionStore } from './session-store'

const ORIGIN = 'http://kurio.test'
const ANA = { email: 'ana@kurio.test', password: 'Selva2026!' }
const BRUNO = { email: 'bruno@kurio.test', password: 'Pixel2026!' }
const ADMIN = { email: 'admin@kurio.test', password: 'Kurio#Admin2026' }

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
  sessionStore.setGuestCartId(null)
})

async function signIn(user: { email: string; password: string }) {
  const session = await api.login(user)
  sessionStore.setToken(session.token)
  return session
}

async function apiError(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(ApiError)
  return error as ApiError
}

describe('nftListQueryString', () => {
  it('serializa só os filtros preenchidos, listas separadas por vírgula', () => {
    expect(nftListQueryString({})).toEqual({})
    expect(
      nftListQueryString({ q: 'ape', category: ['arte-digital', 'musica'], network: ['ethereum'], minPrice: '0.5', maxPrice: '2', onlyAvailable: true, sort: 'price_asc', page: 2, pageSize: 9 }),
    ).toEqual({ q: 'ape', category: 'arte-digital,musica', network: 'ethereum', minPrice: '0.5', maxPrice: '2', onlyAvailable: 'true', sort: 'price_asc', page: '2', pageSize: '9' })
    expect(nftListQueryString({ category: [], network: [], onlyAvailable: false })).toEqual({})
  })
})

describe('catálogo', () => {
  it('lista com filtros, destaques e detalhe; NFT inexistente é NOT_FOUND', async () => {
    const page = await api.listNfts({ network: ['ethereum'], sort: 'price_asc', pageSize: 3 })
    expect(page.items.length).toBeLessThanOrEqual(3)
    expect(page.items.every((n) => n.network === 'ethereum')).toBe(true)
    const prices = page.items.map((n) => Number(n.price))
    expect([...prices].sort((a, b) => a - b)).toEqual(prices)

    const featured = await api.featuredNfts()
    expect(featured.items.length).toBeGreaterThan(0)

    const nft = await api.getNft('nft-01')
    expect(nft).toMatchObject({ id: 'nft-01', editions: expect.any(Array) })

    const missing = await apiError(api.getNft('nft-que-nao-existe'))
    expect(missing).toMatchObject({ status: 404, code: 'NOT_FOUND' })
  })
})

describe('sessão', () => {
  it('cadastro, sessão atual, credencial errada e logout', async () => {
    const created = await api.signup({ username: 'carla_kurio', email: 'carla@kurio.test', password: 'Carla2026x' })
    expect(created.user).toMatchObject({ username: 'carla_kurio', role: 'user' })
    sessionStore.setToken(created.token)
    expect((await api.getSession()).user.email).toBe('carla@kurio.test')

    const taken = await apiError(api.signup({ username: 'carla_kurio', email: 'carla@kurio.test', password: 'Carla2026x' }))
    expect(taken.code).toBe('EMAIL_TAKEN')
    expect(Object.keys(taken.fields)).toEqual(expect.arrayContaining(['email', 'username']))

    const wrong = await apiError(api.login({ email: ANA.email, password: 'errada123' }))
    expect(wrong.code).toBe('INVALID_CREDENTIALS')

    await api.logout()
    const after = await apiError(api.getSession())
    expect(after.status).toBe(401)
  })

  it('recuperação de senha: pedido neutro, link de uso único e senha nova valendo', async () => {
    await api.requestPasswordReset({ email: ANA.email })
    const email = db.lastEmail(ANA.email)!
    const token = new URL(email.link).searchParams.get('token')!
    await expect(api.getPasswordReset(token)).resolves.toBeTruthy()
    await api.confirmPasswordReset({ token, password: 'Nova2026x' })
    expect((await apiError(api.getPasswordReset(token))).status).toBeGreaterThanOrEqual(400)
    expect((await api.login({ email: ANA.email, password: 'Nova2026x' })).user.email).toBe(ANA.email)
  })
})

describe('favoritos e carrinho', () => {
  it('favoritar e desfavoritar devolvem a lista atual', async () => {
    await signIn(BRUNO)
    expect((await api.addFavorite('nft-02')).nftIds).toContain('nft-02')
    expect((await api.getFavorites()).nftIds).toContain('nft-02')
    expect((await api.removeFavorite('nft-02')).nftIds).not.toContain('nft-02')
  })

  it('carrinho de visitante (X-Cart-Id) é mesclado no da conta ao entrar', async () => {
    // Sem sessão e sem id: a API cria o carrinho de visitante; o app guarda o id e o manda em X-Cart-Id.
    const guest = await api.addToCart({ nftId: 'nft-02', editionId: 'nft-02-ed-2', quantity: 1 })
    sessionStore.setGuestCartId(guest.id)
    expect((await api.getCart()).id).toBe(guest.id)
    await signIn(BRUNO)
    const merged = await api.mergeCart(sessionStore.getGuestCartId())
    expect(merged.items.map((i) => i.editionId)).toContain('nft-02-ed-2')
  })

  it('quantidade, cupom, aviso de preço e remoção', async () => {
    await signIn(BRUNO)
    let cart = await api.addToCart({ nftId: 'nft-02', editionId: 'nft-02-ed-2', quantity: 1 })
    const item = cart.items[0]
    cart = await api.updateCartItem(item.id, 2)
    expect(cart.items[0].quantity).toBe(2)

    cart = await api.applyCoupon('KURIO10')
    expect(cart.coupon?.code).toBe('KURIO10')
    expect((await apiError(api.applyCoupon('NAOEXISTE'))).code).toBe('COUPON_INVALID')
    cart = await api.removeCoupon()
    expect(cart.coupon).toBeNull()

    cart = await api.acknowledgePrices()
    cart = await api.removeCartItem(item.id)
    expect(cart.items).toHaveLength(0)
    expect((await api.getCart()).items).toHaveLength(0)
  })
})

describe('pagamento e pedidos', () => {
  it('cotação, pedido idempotente (mesma chave = mesmo pedido) e listagem', async () => {
    const session = await signIn(ANA)
    await api.addToCart({ nftId: 'nft-01', editionId: 'nft-01-ed-3', quantity: 1 })
    const { items: wallets } = await api.getWallets()
    const wallet = wallets[0]
    const connection = await api.connectWallet(wallet.id, wallet.network)
    expect(connection).toBeTruthy()

    const quote = await api.createQuote({ network: wallet.network, couponCode: null })
    const body = {
      quoteId: quote.id,
      fingerprint: quote.fingerprint,
      walletId: wallet.id,
      network: wallet.network,
      provider: wallet.provider,
      collector: { displayName: 'Ana', username: 'ana_nft', profileName: 'ana', email: session.user.email, ensName: 'ana-nft', referralCode: 'KURIO-1', note: '' },
    }
    const key = crypto.randomUUID()
    const order = await api.createOrder(body, key)
    expect(order.status).toBe('pending')
    expect((await api.createOrder(body, key)).id).toBe(order.id)
    expect((await api.getOrder(order.id)).id).toBe(order.id)
    expect((await api.listOrders('pending')).items.map((o) => o.id)).toContain(order.id)
    await api.disconnectWallet(wallet.id)
  })
})

describe('perfil e carteiras', () => {
  it('editar perfil, avatar, senha com a atual errada e certa', async () => {
    await signIn(BRUNO)
    const me = await api.getProfile()
    const updated = await api.updateProfile({ name: 'Bruno Pixel', username: me.username, email: me.email, ensName: me.ensName, walletNickname: 'Principal' })
    expect(updated.name).toBe('Bruno Pixel')

    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    expect((await api.updateAvatar(png)).avatarUrl).toBe(png)
    expect((await api.removeAvatar()).avatarUrl).toBeNull()

    const wrong = await apiError(api.changePassword({ currentPassword: 'errada123', newPassword: 'Nova2026x', confirmPassword: 'Nova2026x' }))
    expect(wrong.fields).toHaveProperty('currentPassword')
    await api.changePassword({ currentPassword: BRUNO.password, newPassword: 'Nova2026x', confirmPassword: 'Nova2026x' })
    expect((await api.login({ email: BRUNO.email, password: 'Nova2026x' })).user.email).toBe(BRUNO.email)
  })

  it('cadastrar e alterar carteira', async () => {
    await signIn(BRUNO)
    const input = {
      role: 'primary' as const,
      displayName: 'Bruno',
      nickname: 'Principal',
      network: 'ethereum' as const,
      profileName: 'bruno',
      address: '0x2222222222222222222222222222222222222222',
      secondaryAddress: null,
      provider: 'metamask' as const,
      referralCode: 'KURIO-2',
      email: BRUNO.email,
      ensName: 'bruno-pixel',
    }
    const wallet = await api.createWallet(input)
    expect(wallet.nickname).toBe('Principal')
    expect((await api.updateWallet(wallet.id, { ...input, nickname: 'Cofre' })).nickname).toBe('Cofre')
    expect((await api.getWallets()).items.map((w) => w.id)).toContain(wallet.id)
  })
})

describe('painel administrativo', () => {
  it('conta comum recebe FORBIDDEN; token explícito confere o papel antes de adotar a sessão', async () => {
    const ana = await api.login(ANA)
    expect((await apiError(api.adminMe({ token: ana.token }))).code).toBe('FORBIDDEN')
    await api.logoutToken(ana.token)
    const admin = await api.login(ADMIN)
    expect((await api.adminMe({ token: admin.token })).role).toBe('admin')
  })

  it('NFTs, edições, cupons, pedidos, usuários e números do painel', async () => {
    await signIn(ADMIN)
    expect(await api.adminOverview()).toBeTruthy()
    expect(Array.isArray((await api.adminActivity(5)).items)).toBe(true)

    const list = await api.adminListNfts({ q: 'Emerald', page: 1, pageSize: 6 })
    const nft = list.items[0]
    const featured = await api.adminUpdateNft(nft.id, { version: nft.version, featured: !nft.featured })
    expect(featured.featured).toBe(!nft.featured)
    const edition = featured.editions[0]
    const priced = await api.adminUpdateEdition(nft.id, edition.id, { version: featured.version, price: '3.21' })
    expect(priced.editions.find((e) => e.id === edition.id)?.price).toBe('3.21')
    const conflict = await apiError(api.adminUpdateNft(nft.id, { version: nft.version, featured: nft.featured }))
    expect(conflict.status).toBe(409)

    const coupon = await api.adminCreateCoupon({ code: 'TESTE15', kind: 'percent', value: '15', expiresAt: null })
    expect(coupon.code).toBe('TESTE15')
    expect((await api.adminListCoupons()).items.map((c) => c.code)).toContain('TESTE15')
    expect((await api.adminDeactivateCoupon('TESTE15')).active).toBe(false)

    expect(Array.isArray((await api.adminListOrders({ status: 'pending', page: 1, pageSize: 8 })).items)).toBe(true)
    const users = await api.adminListUsers({ q: 'ana', page: 1, pageSize: 8 })
    expect(users.items.length).toBeGreaterThan(0)
  })
})
