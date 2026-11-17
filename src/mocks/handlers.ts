/**
 * Handlers REST do servidor simulado (MSW).
 * Os contratos de entrada são validados com os mesmos schemas zod usados no cliente.
 */
import { http, HttpResponse, type DefaultBodyType, type HttpResponseResolver, type PathParams } from 'msw'
import {
  AddToCartInput,
  AvatarInput,
  Category,
  CollectorInput,
  CreateOrderInput,
  LoginInput,
  Network,
  NftListParams,
  PasswordChangeInput,
  ProfileInput,
  QuoteInput,
  SignupRequest,
  WalletInput,
  type NftListResponse,
  type Session,
} from '@/api/contracts'
import { compareEth } from '@/lib/eth'
import * as db from './db'
import { apiError, API, bearer, optionalUser, readJson, requireUser, simulateNetwork, zodFields } from './http'
import { consumeFlag, getScenario } from './scenario'

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete'

function route<P extends PathParams = PathParams>(method: Method, path: string, resolver: HttpResponseResolver<P, DefaultBodyType>) {
  return http[method]<P>(`${API}${path}`, async (info) => {
    const failed = await simulateNetwork(info.request)
    if (failed) return failed
    return resolver(info)
  })
}

function sessionBody(user: db.StoredUser, token: string, expiresAt: number): Session {
  return { token, expiresAt: new Date(expiresAt).toISOString(), user: db.publicUser(user) }
}

function cartFor(request: Request) {
  const user = optionalUser(request)
  const guestCartId = request.headers.get('x-cart-id')
  // Token presente mas expirado: não cai silenciosamente no carrinho de visitante.
  if (!user && bearer(request)) return requireUser(request) as Response
  return db.getOrCreateCart({ userId: user?.id ?? null, guestCartId })
}

/** Conexões de carteira ativas (em memória: recarregar a página "desconecta" a extensão). */
const walletConnections = new Map<string, { walletId: string; network: Network }>()

const CATEGORY_VALUES: readonly string[] = Category.options

export const handlers = [
  // ---------- Sessão e conta ----------
  route('post', '/auth/signup', async ({ request }) => {
    const parsed = SignupRequest.safeParse(await readJson(request))
    if (!parsed.success) return apiError('VALIDATION_ERROR', 'Confira os campos destacados', { fields: zodFields(parsed.error.issues) })
    const { username, email, password } = parsed.data
    const fields: Record<string, string> = {}
    if (db.findUserByEmail(email)) fields.email = 'Este e-mail já está cadastrado'
    if (db.findUserByUsername(username)) fields.username = 'Este nome de usuário já está em uso'
    if (Object.keys(fields).length) return apiError('EMAIL_TAKEN', 'Já existe uma conta com esses dados', { fields })
    const user = await db.createUser({ username, email, password })
    const s = db.createSession(user.id, getScenario().sessionTtlSec)
    return HttpResponse.json(sessionBody(user, s.token, s.expiresAt), { status: 201 })
  }),

  route('post', '/auth/login', async ({ request }) => {
    const parsed = LoginInput.safeParse(await readJson(request))
    if (!parsed.success) return apiError('VALIDATION_ERROR', 'Confira os campos destacados', { fields: zodFields(parsed.error.issues) })
    const user = db.findUserByEmail(parsed.data.email)
    if (!user || !(await db.verifyPassword(user, parsed.data.password))) {
      return apiError('INVALID_CREDENTIALS', 'E-mail ou senha incorretos')
    }
    const s = db.createSession(user.id, getScenario().sessionTtlSec)
    return HttpResponse.json(sessionBody(user, s.token, s.expiresAt))
  }),

  route('get', '/auth/session', ({ request }) => {
    const token = bearer(request)
    const s = db.lookupSession(token)
    if (s.status === 'ok') return HttpResponse.json(sessionBody(s.user, s.session.token, s.session.expiresAt))
    if (s.status === 'expired') return apiError('SESSION_EXPIRED', 'Sua sessão expirou. Entre novamente.')
    return apiError('UNAUTHENTICATED', 'Sem sessão ativa')
  }),

  route('post', '/auth/logout', ({ request }) => {
    const token = bearer(request)
    if (token) db.deleteSession(token)
    return new HttpResponse(null, { status: 204 })
  }),

  // ---------- NFTs ----------
  route('get', '/nfts/featured', () => {
    const items = db.getState().nfts.filter((n) => n.featured).map(db.toSummary)
    return HttpResponse.json({ items })
  }),

  route('get', '/nfts', ({ request }) => {
    const sp = new URL(request.url).searchParams
    const list = (k: string) => sp.get(k)?.split(',').filter(Boolean)
    const parsed = NftListParams.safeParse({
      q: sp.get('q') ?? undefined,
      category: list('category')?.filter((c) => CATEGORY_VALUES.includes(c)) as Category[] | undefined,
      network: list('network'),
      minPrice: sp.get('minPrice') ?? undefined,
      maxPrice: sp.get('maxPrice') ?? undefined,
      onlyAvailable: sp.get('onlyAvailable') === 'true' || undefined,
      sort: sp.get('sort') ?? undefined,
      page: sp.get('page') ? Number(sp.get('page')) : undefined,
      pageSize: sp.get('pageSize') ? Number(sp.get('pageSize')) : undefined,
    })
    if (!parsed.success) return apiError('VALIDATION_ERROR', 'Parâmetros de busca inválidos', { fields: zodFields(parsed.error.issues) })
    const p = parsed.data
    const q = p.q?.trim().toLowerCase()
    const all = db.getState().nfts
    const matches = (n: (typeof all)[number], skip?: 'category' | 'network') => {
      if (q && !`${n.name} ${n.collection} ${n.creator.name}`.toLowerCase().includes(q)) return false
      if (skip !== 'category' && p.category?.length && !p.category.includes(n.category)) return false
      if (skip !== 'network' && p.network?.length && !p.network.includes(n.network)) return false
      if (p.minPrice && compareEth(n.price, p.minPrice) < 0) return false
      if (p.maxPrice && compareEth(n.price, p.maxPrice) > 0) return false
      if (p.onlyAvailable && n.available === 0) return false
      return true
    }
    let items = all.filter((n) => matches(n))
    const facets = {
      category: Object.fromEntries(Category.options.map((c) => [c, all.filter((n) => n.category === c && matches(n, 'category')).length])),
      network: Object.fromEntries(Network.options.map((c) => [c, all.filter((n) => n.network === c && matches(n, 'network')).length])),
      priceRange: all.reduce(
        (r, n) => ({ min: compareEth(n.price, r.min) < 0 ? n.price : r.min, max: compareEth(n.price, r.max) > 0 ? n.price : r.max }),
        { min: all[0].price, max: all[0].price },
      ),
    }
    const sort = p.sort ?? 'relevance'
    items = [...items].sort((a, b) => {
      switch (sort) {
        case 'price_asc':
          return compareEth(a.price, b.price) || a.id.localeCompare(b.id)
        case 'price_desc':
          return compareEth(b.price, a.price) || a.id.localeCompare(b.id)
        case 'recent':
          return b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)
        case 'popular':
          return b.likes - a.likes || a.id.localeCompare(b.id)
        default:
          return Number(b.featured) - Number(a.featured) || a.id.localeCompare(b.id)
      }
    })
    const pageSize = p.pageSize ?? 9
    const total = items.length
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const page = Math.min(p.page ?? 1, totalPages)
    const body: NftListResponse = {
      items: items.slice((page - 1) * pageSize, page * pageSize).map(db.toSummary),
      page,
      pageSize,
      total,
      totalPages,
      facets,
    }
    return HttpResponse.json(body)
  }),

  route<{ id: string }>('get', '/nfts/:id', ({ params }) => {
    const n = db.findNft(params.id)
    if (!n) return apiError('NOT_FOUND', 'NFT não encontrado')
    return HttpResponse.json(n)
  }),

  // ---------- Favoritos ----------
  route('get', '/favorites', ({ request }) => {
    const auth = requireUser(request)
    if (auth instanceof Response) return auth
    return HttpResponse.json({ nftIds: db.getFavorites(auth.user.id) })
  }),

  route<{ nftId: string }>('put', '/favorites/:nftId', ({ request, params }) => {
    const auth = requireUser(request)
    if (auth instanceof Response) return auth
    if (!db.findNft(params.nftId)) return apiError('NOT_FOUND', 'NFT não encontrado')
    return HttpResponse.json({ nftIds: db.setFavorite(auth.user.id, params.nftId, true) })
  }),

  route<{ nftId: string }>('delete', '/favorites/:nftId', ({ request, params }) => {
    const auth = requireUser(request)
    if (auth instanceof Response) return auth
    return HttpResponse.json({ nftIds: db.setFavorite(auth.user.id, params.nftId, false) })
  }),

  // ---------- Carrinho ----------
  route('get', '/cart', ({ request }) => {
    const cart = cartFor(request)
    if (cart instanceof Response) return cart
    return HttpResponse.json(db.serializeCart(cart))
  }),

  route('post', '/cart/items', async ({ request }) => {
    const cart = cartFor(request)
    if (cart instanceof Response) return cart
    const parsed = AddToCartInput.safeParse(await readJson(request))
    if (!parsed.success) return apiError('VALIDATION_ERROR', 'Dados inválidos', { fields: zodFields(parsed.error.issues) })
    const err = db.addCartItem(cart, parsed.data.nftId, parsed.data.editionId, parsed.data.quantity)
    if (err) return apiError(err.code, err.message, err.code === 'AVAILABILITY_CONFLICT' ? { details: { available: err.available } } : {})
    return HttpResponse.json(db.serializeCart(cart), { status: 201 })
  }),

  route<{ itemId: string }>('patch', '/cart/items/:itemId', async ({ request, params }) => {
    const cart = cartFor(request)
    if (cart instanceof Response) return cart
    const body = await readJson<{ quantity?: number }>(request)
    const quantity = Number(body?.quantity)
    if (!Number.isInteger(quantity) || quantity < 1) {
      return apiError('VALIDATION_ERROR', 'Quantidade deve ser um número inteiro maior que zero', { fields: { quantity: 'Quantidade inválida' } })
    }
    const err = db.updateCartItem(cart, params.itemId, quantity)
    if (err) return apiError(err.code, err.message, err.code === 'AVAILABILITY_CONFLICT' ? { details: { available: err.available } } : {})
    return HttpResponse.json(db.serializeCart(cart))
  }),

  route<{ itemId: string }>('delete', '/cart/items/:itemId', ({ request, params }) => {
    const cart = cartFor(request)
    if (cart instanceof Response) return cart
    if (!db.removeCartItem(cart, params.itemId)) return apiError('NOT_FOUND', 'Item não está no carrinho')
    return HttpResponse.json(db.serializeCart(cart))
  }),

  route('post', '/cart/coupon', async ({ request }) => {
    const cart = cartFor(request)
    if (cart instanceof Response) return cart
    const body = await readJson<{ code?: string }>(request)
    const code = String(body?.code ?? '').trim()
    if (!code) return apiError('VALIDATION_ERROR', 'Informe um cupom', { fields: { code: 'Informe um cupom' } })
    const check = db.checkCoupon(code)
    if (!check.ok) return apiError(check.code, check.message, { fields: { code: check.message } })
    db.setCartCoupon(cart, check.coupon.code)
    return HttpResponse.json(db.serializeCart(cart))
  }),

  route('delete', '/cart/coupon', ({ request }) => {
    const cart = cartFor(request)
    if (cart instanceof Response) return cart
    db.setCartCoupon(cart, null)
    return HttpResponse.json(db.serializeCart(cart))
  }),

  route('post', '/cart/acknowledge-prices', ({ request }) => {
    const cart = cartFor(request)
    if (cart instanceof Response) return cart
    db.acknowledgeCartPrices(cart)
    return HttpResponse.json(db.serializeCart(cart))
  }),

  route('post', '/cart/merge', async ({ request }) => {
    const auth = requireUser(request)
    if (auth instanceof Response) return auth
    const body = await readJson<{ guestCartId?: string }>(request)
    const cart = db.getOrCreateCart({ userId: auth.user.id, guestCartId: null })
    if (body?.guestCartId) db.mergeCarts(body.guestCartId, cart)
    return HttpResponse.json(db.serializeCart(cart))
  }),

  // ---------- Cotação ----------
  route('post', '/quotes', async ({ request }) => {
    const auth = requireUser(request)
    if (auth instanceof Response) return auth
    const parsed = QuoteInput.safeParse(await readJson(request))
    if (!parsed.success) return apiError('VALIDATION_ERROR', 'Dados inválidos', { fields: zodFields(parsed.error.issues) })
    const cart = db.getOrCreateCart({ userId: auth.user.id, guestCartId: null })
    const result = await db.buildQuote(auth.user.id, cart, parsed.data.network, parsed.data.couponCode)
    if (!result.ok) return apiError(result.code, result.message, { details: result.details })
    return HttpResponse.json(db.publicQuote(result.quote))
  }),

  // ---------- Carteiras ----------
  route('get', '/wallets', ({ request }) => {
    const auth = requireUser(request)
    if (auth instanceof Response) return auth
    return HttpResponse.json({ items: db.getWallets(auth.user.id) })
  }),

  route('post', '/wallets', async ({ request }) => {
    const auth = requireUser(request)
    if (auth instanceof Response) return auth
    const parsed = WalletInput.safeParse(await readJson(request))
    if (!parsed.success) return apiError('VALIDATION_ERROR', 'Confira os campos destacados', { fields: zodFields(parsed.error.issues) })
    const duplicate = db.getWallets(auth.user.id).find((w) => w.address.toLowerCase() === parsed.data.address.toLowerCase() && w.role !== parsed.data.role)
    if (duplicate) return apiError('CONFLICT', 'Este endereço já está cadastrado na outra carteira', { fields: { address: 'Endereço já cadastrado como ' + (duplicate.role === 'primary' ? 'principal' : 'secundária') } })
    if (db.getWallets(auth.user.id).some((w) => w.role === parsed.data.role)) {
      return apiError('CONFLICT', 'Já existe uma carteira ' + (parsed.data.role === 'primary' ? 'principal' : 'secundária') + '. Edite a existente.')
    }
    return HttpResponse.json(db.upsertWallet(auth.user.id, parsed.data), { status: 201 })
  }),

  route<{ id: string }>('put', '/wallets/:id', async ({ request, params }) => {
    const auth = requireUser(request)
    if (auth instanceof Response) return auth
    const wallet = db.getWallets(auth.user.id).find((w) => w.id === params.id)
    if (!wallet) return apiError('NOT_FOUND', 'Carteira não encontrada')
    const parsed = WalletInput.safeParse(await readJson(request))
    if (!parsed.success) return apiError('VALIDATION_ERROR', 'Confira os campos destacados', { fields: zodFields(parsed.error.issues) })
    const duplicate = db.getWallets(auth.user.id).find((w) => w.id !== params.id && w.address.toLowerCase() === parsed.data.address.toLowerCase())
    if (duplicate) return apiError('CONFLICT', 'Este endereço já está cadastrado na outra carteira', { fields: { address: 'Endereço já cadastrado na outra carteira' } })
    return HttpResponse.json(db.upsertWallet(auth.user.id, parsed.data, params.id))
  }),

  route<{ id: string }>('post', '/wallets/:id/connect', async ({ request, params }) => {
    const auth = requireUser(request)
    if (auth instanceof Response) return auth
    const wallet = db.getWallets(auth.user.id).find((w) => w.id === params.id)
    if (!wallet) return apiError('NOT_FOUND', 'Carteira não encontrada')
    const body = await readJson<{ network?: string }>(request)
    const network = Network.safeParse(body?.network)
    if (!network.success) return apiError('VALIDATION_ERROR', 'Rede inválida', { fields: { network: 'Selecione uma rede' } })
    if (wallet.network !== network.data) {
      return apiError('VALIDATION_ERROR', 'Esta carteira não opera nessa rede', { fields: { network: 'Rede não suportada pela carteira' } })
    }
    if (consumeFlag('walletRejectOnce')) return apiError('WALLET_REJECTED', 'Conexão recusada na carteira')
    walletConnections.set(auth.user.id, { walletId: wallet.id, network: network.data })
    return HttpResponse.json({ walletId: wallet.id, network: network.data, status: 'connected', connectedAt: new Date().toISOString() })
  }),

  route<{ id: string }>('delete', '/wallets/:id/connect', ({ request }) => {
    const auth = requireUser(request)
    if (auth instanceof Response) return auth
    walletConnections.delete(auth.user.id)
    return new HttpResponse(null, { status: 204 })
  }),

  // ---------- Pedidos ----------
  route('post', '/orders', async ({ request }) => {
    const auth = requireUser(request)
    if (auth instanceof Response) return auth
    const key = request.headers.get('idempotency-key')
    if (!key) return apiError('VALIDATION_ERROR', 'Cabeçalho Idempotency-Key é obrigatório')
    const body = await readJson(request)
    const parsed = CreateOrderInput.safeParse(body)
    if (!parsed.success) return apiError('VALIDATION_ERROR', 'Confira os dados do pedido', { fields: zodFields(parsed.error.issues) })
    const requestHash = await db.stableHash(parsed.data)

    // 1) Mesma chave: devolve o mesmo pedido (ou conflito se o conteúdo mudou).
    const previous = db.findIdempotency(auth.user.id, key)
    if (previous) {
      if (previous.requestHash !== requestHash) {
        return apiError('IDEMPOTENCY_CONFLICT', 'Esta chave de idempotência já foi usada com outro conteúdo')
      }
      const order = db.findOrder(previous.orderId)!
      return HttpResponse.json(db.publicOrder(order), { status: 200, headers: { 'Idempotent-Replayed': 'true' } })
    }

    // 2) Carteira conectada na rede escolhida.
    const conn = walletConnections.get(auth.user.id)
    const wallet = db.getWallets(auth.user.id).find((w) => w.id === parsed.data.walletId)
    if (!wallet) return apiError('VALIDATION_ERROR', 'Carteira não encontrada', { fields: { walletId: 'Selecione uma carteira cadastrada' } })
    if (!conn || conn.walletId !== wallet.id || conn.network !== parsed.data.network) {
      return apiError('VALIDATION_ERROR', 'Conecte a carteira na rede selecionada antes de confirmar', { fields: { walletId: 'Carteira desconectada' } })
    }

    // 3) Revalida a cotação contra o estado atual do catálogo, cupom e taxas.
    const quote = db.findQuote(parsed.data.quoteId)
    const cart = db.getOrCreateCart({ userId: auth.user.id, guestCartId: null })
    const fresh = await db.buildQuote(auth.user.id, cart, parsed.data.network, quote?.coupon?.code ?? null)
    if (!fresh.ok) return apiError(fresh.code, fresh.message, { details: fresh.details })
    if (!quote || quote.userId !== auth.user.id || fresh.quote.fingerprint !== parsed.data.fingerprint) {
      return apiError('QUOTE_OUTDATED', 'Preço, disponibilidade ou taxas mudaram. Revise e confirme novamente.', {
        details: { quote: db.publicQuote(fresh.quote) },
      })
    }

    const s = getScenario()
    const order = db.createOrder({
      userId: auth.user.id,
      key,
      requestHash,
      quote: fresh.quote,
      wallet,
      provider: parsed.data.provider,
      collector: CollectorInput.parse(parsed.data.collector),
      outcome: s.payment,
      paymentDelayMs: s.paymentDelayMs,
    })

    // Cenário: o pedido foi gravado, mas a resposta não chega a tempo (timeout no cliente).
    if (consumeFlag('orderTimeoutOnce')) {
      await new Promise((r) => setTimeout(r, 15_000))
      return apiError('TRANSIENT_FAILURE', 'Gateway timeout (simulado)')
    }
    return HttpResponse.json(db.publicOrder(order), { status: 201 })
  }),

  route('get', '/orders', ({ request }) => {
    const auth = requireUser(request)
    if (auth instanceof Response) return auth
    const status = new URL(request.url).searchParams.get('status')
    const items = db
      .getState()
      .orders.filter((o) => o.userId === auth.user.id && (!status || o.status === status))
      .map(db.publicOrder)
      .reverse()
    return HttpResponse.json({ items })
  }),

  route<{ id: string }>('get', '/orders/:id', ({ request, params }) => {
    const auth = requireUser(request)
    if (auth instanceof Response) return auth
    const order = db.findOrder(params.id)
    if (!order) return apiError('NOT_FOUND', 'Pedido não encontrado')
    if (order.userId !== auth.user.id) return apiError('FORBIDDEN', 'Este pedido pertence a outra conta')
    return HttpResponse.json(db.publicOrder(order))
  }),

  // ---------- Perfil ----------
  route('get', '/profile', ({ request }) => {
    const auth = requireUser(request)
    if (auth instanceof Response) return auth
    return HttpResponse.json(db.publicUser(auth.user))
  }),

  route('patch', '/profile', async ({ request }) => {
    const auth = requireUser(request)
    if (auth instanceof Response) return auth
    const parsed = ProfileInput.safeParse(await readJson(request))
    if (!parsed.success) return apiError('VALIDATION_ERROR', 'Confira os campos destacados', { fields: zodFields(parsed.error.issues) })
    const fields: Record<string, string> = {}
    const byEmail = db.findUserByEmail(parsed.data.email)
    if (byEmail && byEmail.id !== auth.user.id) fields.email = 'Este e-mail já está em uso'
    const byUsername = db.findUserByUsername(parsed.data.username)
    if (byUsername && byUsername.id !== auth.user.id) fields.username = 'Este nome de usuário já está em uso'
    if (Object.keys(fields).length) return apiError('CONFLICT', 'Alguns dados já estão em uso', { fields })
    db.updateUser(auth.user, parsed.data)
    return HttpResponse.json(db.publicUser(auth.user))
  }),

  route('put', '/profile/avatar', async ({ request }) => {
    const auth = requireUser(request)
    if (auth instanceof Response) return auth
    const parsed = AvatarInput.safeParse(await readJson(request))
    if (!parsed.success) return apiError('VALIDATION_ERROR', 'Imagem inválida', { fields: { avatar: parsed.error.issues[0].message } })
    if (parsed.data.dataUrl.length > 1_400_000) return apiError('VALIDATION_ERROR', 'Imagem muito grande', { fields: { avatar: 'A imagem deve ter até 1 MB' } })
    db.updateUser(auth.user, { avatarUrl: parsed.data.dataUrl })
    return HttpResponse.json(db.publicUser(auth.user))
  }),

  route('delete', '/profile/avatar', ({ request }) => {
    const auth = requireUser(request)
    if (auth instanceof Response) return auth
    db.updateUser(auth.user, { avatarUrl: null })
    return HttpResponse.json(db.publicUser(auth.user))
  }),

  route('post', '/profile/password', async ({ request }) => {
    const auth = requireUser(request)
    if (auth instanceof Response) return auth
    const parsed = PasswordChangeInput.safeParse(await readJson(request))
    if (!parsed.success) return apiError('VALIDATION_ERROR', 'Confira os campos destacados', { fields: zodFields(parsed.error.issues) })
    if (!(await db.verifyPassword(auth.user, parsed.data.currentPassword))) {
      return apiError('VALIDATION_ERROR', 'Senha atual incorreta', { fields: { currentPassword: 'Senha atual incorreta' } })
    }
    await db.setPassword(auth.user, parsed.data.newPassword)
    return new HttpResponse(null, { status: 204 })
  }),

  // Qualquer outra rota da API: 404 no formato do contrato.
  http.all(`${API}/*`, () => apiError('NOT_FOUND', 'Rota da API inexistente')),
]
