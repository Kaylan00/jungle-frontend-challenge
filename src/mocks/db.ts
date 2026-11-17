/**
 * "Banco de dados" do servidor simulado.
 *
 * Um único estado consistente entre catálogo, favoritos, carrinho, perfil, carteiras e pedidos.
 * Toda mudança que interessa ao tempo real (preço, estoque, status de pedido) gera um evento
 * que o servidor Socket.IO simulado (mocks/realtime.ts) envia aos clientes conectados.
 *
 * Persistência: localStorage, para sobreviver ao refresh. `resetDb()` restaura a seed.
 * Senhas: só hash SHA-256 com salt aleatório por usuário; nunca em claro.
 */
import type {
  Cart,
  CartItem,
  Coupon,
  Network,
  NftDetail,
  NftSummary,
  NftUpdatedEvent,
  Order,
  OrderUpdatedEvent,
  Quote,
  QuoteLine,
  User,
  Wallet,
} from '@/api/contracts'
import { addEth, compareEth, mulEth, percentOf, subEth } from '@/lib/eth'
import { buildNftFixtures } from './fixtures/nfts'
import { COUPONS, NETWORK_FEES, SEED_USERS } from './fixtures/users'

// ---------- Tipos internos (o que o "servidor" guarda) ----------

export interface StoredUser extends User {
  passwordHash: string
  salt: string
}

interface StoredSession {
  token: string
  userId: string
  expiresAt: number
}

interface StoredCartItem {
  id: string
  nftId: string
  editionId: string
  quantity: number
  priceWhenAdded: string
}

interface StoredCart {
  id: string
  userId: string | null
  items: StoredCartItem[]
  couponCode: string | null
  version: number
  updatedAt: string
}

interface StoredQuote extends Quote {
  userId: string
  cartId: string
}

interface StoredOrder extends Order {
  /** Resultado decidido na criação a partir do cenário; aplicado quando settleAt passa */
  outcome: 'approve' | 'reject'
  settleAt: number
}

interface IdempotencyRecord {
  userId: string
  key: string
  requestHash: string
  orderId: string
}

export interface DbState {
  schema: 1
  users: StoredUser[]
  sessions: StoredSession[]
  nfts: NftDetail[]
  favorites: Record<string, string[]>
  carts: Record<string, StoredCart>
  wallets: Record<string, Wallet[]>
  quotes: Record<string, StoredQuote>
  orders: StoredOrder[]
  idempotency: IdempotencyRecord[]
  seq: number
  eventSeq: number
}

const STORAGE_KEY = 'jungle.mock.db.v1'

let state: DbState
let ready: Promise<void> | null = null

// ---------- Utilidades ----------

const now = () => Date.now()
const iso = (t = now()) => new Date(t).toISOString()

function nextId(prefix: string) {
  state.seq += 1
  return `${prefix}-${state.seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

function randomHex(bytes: number) {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function hashPassword(password: string, salt: string) {
  const data = new TextEncoder().encode(`${salt}:${password}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function stableHash(value: unknown) {
  const data = new TextEncoder().encode(JSON.stringify(value))
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest).slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('')
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* storage cheio ou indisponível: segue só em memória */
  }
}

// ---------- Eventos ----------

type DbEvent = NftUpdatedEvent | OrderUpdatedEvent
const eventListeners = new Set<(e: DbEvent) => void>()
let lastEvent: DbEvent | null = null

export function onDbEvent(fn: (e: DbEvent) => void) {
  eventListeners.add(fn)
  return () => eventListeners.delete(fn)
}

export function getLastEvent() {
  return lastEvent
}

function emit(event: DbEvent) {
  lastEvent = event
  eventListeners.forEach((fn) => fn(event))
}

function nextEventId() {
  state.eventSeq += 1
  return `evt-${state.eventSeq}`
}

// ---------- Seed / reset ----------

async function buildSeed(): Promise<DbState> {
  const users: StoredUser[] = []
  const wallets: Record<string, Wallet[]> = {}
  const favorites: Record<string, string[]> = {}
  for (const u of SEED_USERS) {
    const salt = randomHex(16)
    users.push({
      id: u.id,
      name: u.name,
      username: u.username,
      email: u.email,
      ensName: u.ensName,
      walletNickname: u.walletNickname,
      avatarUrl: null,
      createdAt: '2026-01-10T12:00:00.000Z',
      salt,
      passwordHash: await hashPassword(u.password, salt),
    })
    wallets[u.id] = u.wallets.map((w) => ({ ...w, updatedAt: '2026-01-10T12:00:00.000Z' }))
    favorites[u.id] = [...u.favorites]
  }
  return {
    schema: 1,
    users,
    sessions: [],
    nfts: buildNftFixtures(),
    favorites,
    carts: {},
    wallets,
    quotes: {},
    orders: [],
    idempotency: [],
    seq: 1000,
    eventSeq: 0,
  }
}

export function initDb() {
  if (!ready) {
    ready = (async () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) {
          const parsed = JSON.parse(raw) as DbState
          if (parsed.schema === 1) {
            state = parsed
            return
          }
        }
      } catch {
        /* estado corrompido: recria */
      }
      state = await buildSeed()
      persist()
    })()
  }
  return ready
}

export async function resetDb() {
  state = await buildSeed()
  lastEvent = null
  persist()
}

export function getState() {
  return state
}

// ---------- Sessão e usuários ----------

export function publicUser(u: StoredUser): User {
  const { passwordHash: _h, salt: _s, ...rest } = u
  return rest
}

export function findUserByEmail(email: string) {
  return state.users.find((u) => u.email.toLowerCase() === email.toLowerCase())
}

export function findUserByUsername(username: string) {
  return state.users.find((u) => u.username.toLowerCase() === username.toLowerCase())
}

export function findUser(id: string) {
  return state.users.find((u) => u.id === id)
}

export async function createUser(input: { username: string; email: string; password: string }) {
  const salt = randomHex(16)
  const user: StoredUser = {
    id: nextId('usr'),
    name: input.username,
    username: input.username,
    email: input.email,
    ensName: input.username.replace(/_/g, '-'),
    walletNickname: 'Principal',
    avatarUrl: null,
    createdAt: iso(),
    salt,
    passwordHash: await hashPassword(input.password, salt),
  }
  state.users.push(user)
  state.favorites[user.id] = []
  state.wallets[user.id] = []
  persist()
  return user
}

export async function verifyPassword(user: StoredUser, password: string) {
  return (await hashPassword(password, user.salt)) === user.passwordHash
}

export async function setPassword(user: StoredUser, password: string) {
  user.salt = randomHex(16)
  user.passwordHash = await hashPassword(password, user.salt)
  persist()
}

export function createSession(userId: string, ttlSec: number) {
  const session: StoredSession = { token: `tok_${randomHex(24)}`, userId, expiresAt: now() + ttlSec * 1000 }
  state.sessions.push(session)
  persist()
  return session
}

export type SessionLookup = { status: 'ok'; user: StoredUser; session: StoredSession } | { status: 'missing' | 'expired' }

export function lookupSession(token: string | null): SessionLookup {
  if (!token) return { status: 'missing' }
  const session = state.sessions.find((s) => s.token === token)
  if (!session) return { status: 'missing' }
  if (session.expiresAt <= now()) return { status: 'expired' }
  const user = findUser(session.userId)
  if (!user) return { status: 'missing' }
  return { status: 'ok', user, session }
}

export function deleteSession(token: string) {
  state.sessions = state.sessions.filter((s) => s.token !== token)
  persist()
}

/** Expira todas as sessões ativas (cenário "sessão expirada"). */
export function expireAllSessions() {
  state.sessions.forEach((s) => (s.expiresAt = now() - 1))
  persist()
}

export function updateUser(user: StoredUser, patch: Partial<Pick<User, 'name' | 'username' | 'email' | 'ensName' | 'walletNickname' | 'avatarUrl'>>) {
  Object.assign(user, patch)
  persist()
}

// ---------- Catálogo ----------

export function toSummary(n: NftDetail): NftSummary {
  const { description: _d, gallery: _g, editions: _e, attributes: _a, contract: _c, tokenStandard: _t, ...summary } = n
  return summary
}

export function findNft(id: string) {
  return state.nfts.find((n) => n.id === id)
}

function recomputeNft(n: NftDetail) {
  n.editions.forEach((e) => {
    if (e.status !== 'unavailable') e.status = e.available > 0 ? 'on_sale' : 'sold_out'
  })
  const onSale = n.editions.filter((e) => e.status === 'on_sale')
  const pool = onSale.length ? onSale : n.editions
  n.price = pool.reduce((m, e) => (compareEth(e.price, m) < 0 ? e.price : m), pool[0].price)
  n.available = onSale.reduce((s, e) => s + e.available, 0)
  n.version += 1
}

function emitNftUpdated(n: NftDetail) {
  emit({
    type: 'nft.updated',
    eventId: nextEventId(),
    occurredAt: iso(),
    version: n.version,
    resource: { type: 'nft', id: n.id },
    data: {
      price: n.price,
      available: n.available,
      editions: n.editions.map(({ id, price, available, status }) => ({ id, price, available, status })),
    },
  })
}

/** Altera preço e/ou estoque de uma edição e publica `nft.updated`. */
export function updateEdition(nftId: string, editionId: string, patch: { price?: string; available?: number }) {
  const n = findNft(nftId)
  const e = n?.editions.find((x) => x.id === editionId)
  if (!n || !e) return null
  if (patch.price !== undefined) e.price = patch.price
  if (patch.available !== undefined) e.available = Math.max(0, patch.available)
  recomputeNft(n)
  persist()
  emitNftUpdated(n)
  return n
}

/** Envia de novo o último evento (mesmo eventId) — testa tolerância a duplicatas. */
export function reemitLastEvent() {
  if (lastEvent) eventListeners.forEach((fn) => fn(lastEvent!))
  return lastEvent
}

/** Envia um evento com versão antiga e dados divergentes — o cliente deve ignorar. */
export function emitStaleNftEvent(nftId: string) {
  const n = findNft(nftId)
  if (!n) return null
  const event: NftUpdatedEvent = {
    type: 'nft.updated',
    eventId: nextEventId(),
    occurredAt: iso(now() - 60_000),
    version: Math.max(0, n.version - 1),
    resource: { type: 'nft', id: n.id },
    data: {
      price: '999',
      available: 0,
      editions: n.editions.map(({ id, status }) => ({ id, price: '999', available: 0, status })),
    },
  }
  eventListeners.forEach((fn) => fn(event))
  return event
}

// ---------- Favoritos ----------

export function getFavorites(userId: string) {
  return (state.favorites[userId] ??= [])
}

export function setFavorite(userId: string, nftId: string, value: boolean) {
  const list = getFavorites(userId)
  const has = list.includes(nftId)
  const n = findNft(nftId)
  if (value && !has) {
    list.push(nftId)
    if (n) n.likes += 1
  }
  if (!value && has) {
    state.favorites[userId] = list.filter((id) => id !== nftId)
    if (n) n.likes = Math.max(0, n.likes - 1)
  }
  persist()
  return state.favorites[userId]
}

// ---------- Carrinho ----------

export function getOrCreateCart(opts: { userId: string | null; guestCartId: string | null }): StoredCart {
  if (opts.userId) {
    const existing = Object.values(state.carts).find((c) => c.userId === opts.userId)
    if (existing) return existing
    const cart: StoredCart = { id: nextId('cart'), userId: opts.userId, items: [], couponCode: null, version: 1, updatedAt: iso() }
    state.carts[cart.id] = cart
    persist()
    return cart
  }
  if (opts.guestCartId && state.carts[opts.guestCartId] && !state.carts[opts.guestCartId].userId) {
    return state.carts[opts.guestCartId]
  }
  const cart: StoredCart = { id: nextId('guest'), userId: null, items: [], couponCode: null, version: 1, updatedAt: iso() }
  state.carts[cart.id] = cart
  persist()
  return cart
}

function touchCart(cart: StoredCart) {
  cart.version += 1
  cart.updatedAt = iso()
  persist()
}

export type CartError =
  | { code: 'NOT_FOUND'; message: string }
  | { code: 'AVAILABILITY_CONFLICT'; message: string; available: number }

export function addCartItem(cart: StoredCart, nftId: string, editionId: string, quantity: number): CartError | null {
  const n = findNft(nftId)
  const e = n?.editions.find((x) => x.id === editionId)
  if (!n || !e) return { code: 'NOT_FOUND', message: 'NFT ou edição não encontrada' }
  if (e.status !== 'on_sale') return { code: 'AVAILABILITY_CONFLICT', message: 'Esta edição não está à venda', available: 0 }
  const existing = cart.items.find((i) => i.nftId === nftId && i.editionId === editionId)
  const desired = (existing?.quantity ?? 0) + quantity
  const limit = Math.min(e.available, e.maxPerOrder)
  if (desired > limit) {
    return {
      code: 'AVAILABILITY_CONFLICT',
      message: `Só é possível ter ${limit} unidade(s) desta edição no carrinho`,
      available: limit,
    }
  }
  if (existing) {
    existing.quantity = desired
    existing.priceWhenAdded = e.price
  } else {
    cart.items.push({ id: nextId('ci'), nftId, editionId, quantity, priceWhenAdded: e.price })
  }
  touchCart(cart)
  return null
}

export function updateCartItem(cart: StoredCart, itemId: string, quantity: number): CartError | null {
  const item = cart.items.find((i) => i.id === itemId)
  if (!item) return { code: 'NOT_FOUND', message: 'Item não está no carrinho' }
  const e = findNft(item.nftId)?.editions.find((x) => x.id === item.editionId)
  const limit = e && e.status === 'on_sale' ? Math.min(e.available, e.maxPerOrder) : 0
  if (quantity > limit) {
    return { code: 'AVAILABILITY_CONFLICT', message: `Disponível: ${limit} unidade(s)`, available: limit }
  }
  item.quantity = quantity
  touchCart(cart)
  return null
}

export function removeCartItem(cart: StoredCart, itemId: string) {
  const before = cart.items.length
  cart.items = cart.items.filter((i) => i.id !== itemId)
  if (cart.items.length !== before) touchCart(cart)
  return cart.items.length !== before
}

/** "Aceito o novo preço": atualiza priceWhenAdded para o preço atual de cada item. */
export function acknowledgeCartPrices(cart: StoredCart) {
  cart.items.forEach((i) => {
    const e = findNft(i.nftId)?.editions.find((x) => x.id === i.editionId)
    if (e) i.priceWhenAdded = e.price
  })
  touchCart(cart)
}

export function mergeCarts(guestCartId: string, userCart: StoredCart) {
  const guest = state.carts[guestCartId]
  if (!guest || guest.userId) return
  for (const gi of guest.items) {
    const e = findNft(gi.nftId)?.editions.find((x) => x.id === gi.editionId)
    if (!e || e.status !== 'on_sale') continue
    const limit = Math.min(e.available, e.maxPerOrder)
    const existing = userCart.items.find((i) => i.nftId === gi.nftId && i.editionId === gi.editionId)
    if (existing) existing.quantity = Math.min(limit, Math.max(existing.quantity, gi.quantity))
    else userCart.items.push({ ...gi, id: nextId('ci'), quantity: Math.min(limit, gi.quantity) })
  }
  if (!userCart.couponCode && guest.couponCode) userCart.couponCode = guest.couponCode
  delete state.carts[guestCartId]
  touchCart(userCart)
}

export type CouponCheck = { ok: true; coupon: Coupon } | { ok: false; code: 'COUPON_INVALID' | 'COUPON_EXPIRED'; message: string }

export function checkCoupon(code: string): CouponCheck {
  const c = COUPONS.find((x) => x.code === code.trim().toUpperCase())
  if (!c) return { ok: false, code: 'COUPON_INVALID', message: 'Cupom inválido' }
  if (new Date(c.expiresAt).getTime() < now()) return { ok: false, code: 'COUPON_EXPIRED', message: 'Este cupom expirou' }
  return { ok: true, coupon: { code: c.code, description: c.description, percentOff: c.percentOff } }
}

export function setCartCoupon(cart: StoredCart, code: string | null) {
  cart.couponCode = code
  touchCart(cart)
}

function priceLines(items: StoredCartItem[]) {
  return items.flatMap((i) => {
    const n = findNft(i.nftId)
    const e = n?.editions.find((x) => x.id === i.editionId)
    if (!n || !e) return []
    return [{ item: i, nft: n, edition: e, lineTotal: mulEth(e.price, i.quantity) }]
  })
}

function totals(subtotal: string, couponPercent: string | null, network: Network | null, hasItems: boolean) {
  const discount = couponPercent ? percentOf(subtotal, couponPercent) : '0'
  const networkFee = hasItems ? NETWORK_FEES[network ?? 'ethereum'] : '0'
  const total = addEth(subEth(subtotal, discount), networkFee)
  return { subtotal, discount, networkFee, total }
}

export function serializeCart(cart: StoredCart): Cart {
  // Cupom que expirou depois de aplicado deixa de valer automaticamente.
  let coupon: Coupon | null = null
  if (cart.couponCode) {
    const check = checkCoupon(cart.couponCode)
    if (check.ok) coupon = check.coupon
  }
  const lines = priceLines(cart.items)
  const items: CartItem[] = lines.map(({ item, nft, edition, lineTotal }) => {
    const limit = edition.status === 'on_sale' ? Math.min(edition.available, edition.maxPerOrder) : 0
    let issue: CartItem['issue'] = null
    if (limit === 0) issue = 'sold_out'
    else if (item.quantity > limit) issue = 'insufficient_stock'
    else if (compareEth(item.priceWhenAdded, edition.price) !== 0) issue = 'price_changed'
    return {
      id: item.id,
      nftId: nft.id,
      editionId: edition.id,
      name: nft.name,
      editionName: edition.name,
      image: nft.image,
      collection: nft.collection,
      network: nft.network,
      quantity: item.quantity,
      unitPrice: edition.price,
      priceWhenAdded: item.priceWhenAdded,
      available: edition.available,
      maxPerOrder: edition.maxPerOrder,
      lineTotal,
      issue,
    }
  })
  const subtotal = addEth(...items.filter((i) => i.issue !== 'sold_out').map((i) => i.lineTotal))
  return {
    id: cart.id,
    owner: cart.userId ? 'user' : 'guest',
    items,
    coupon,
    summary: totals(subtotal, coupon?.percentOff ?? null, null, items.length > 0),
    version: cart.version,
    updatedAt: cart.updatedAt,
  }
}

// ---------- Cotação ----------

export type QuoteResult =
  | { ok: true; quote: StoredQuote }
  | { ok: false; code: 'AVAILABILITY_CONFLICT' | 'COUPON_INVALID' | 'COUPON_EXPIRED' | 'VALIDATION_ERROR'; message: string; details?: unknown }

export async function buildQuote(userId: string, cart: StoredCart, network: Network, couponCode: string | null): Promise<QuoteResult> {
  if (cart.items.length === 0) return { ok: false, code: 'VALIDATION_ERROR', message: 'O carrinho está vazio' }
  let coupon: Coupon | null = null
  if (couponCode) {
    const check = checkCoupon(couponCode)
    if (!check.ok) return { ok: false, code: check.code, message: check.message }
    coupon = check.coupon
  }
  const lines = priceLines(cart.items)
  const problems = lines.filter(({ item, edition }) => edition.status !== 'on_sale' || item.quantity > Math.min(edition.available, edition.maxPerOrder))
  if (problems.length) {
    return {
      ok: false,
      code: 'AVAILABILITY_CONFLICT',
      message: 'Alguns itens não têm mais a quantidade desejada disponível',
      details: problems.map(({ item, edition }) => ({ itemId: item.id, available: edition.status === 'on_sale' ? edition.available : 0 })),
    }
  }
  const quoteLines: QuoteLine[] = lines.map(({ item, nft, edition, lineTotal }) => ({
    nftId: nft.id,
    editionId: edition.id,
    name: nft.name,
    editionName: edition.name,
    image: nft.image,
    quantity: item.quantity,
    unitPrice: edition.price,
    lineTotal,
  }))
  const t = totals(addEth(...quoteLines.map((l) => l.lineTotal)), coupon?.percentOff ?? null, network, true)
  const fingerprint = await stableHash({ quoteLines, coupon: coupon?.code ?? null, network, ...t })
  const quote: StoredQuote = {
    id: nextId('qt'),
    userId,
    cartId: cart.id,
    network,
    lines: quoteLines,
    coupon,
    ...t,
    fingerprint,
    expiresAt: iso(now() + 10 * 60_000),
  }
  state.quotes[quote.id] = quote
  persist()
  return { ok: true, quote }
}

export function publicQuote(q: StoredQuote): Quote {
  const { userId: _u, cartId: _c, ...rest } = q
  return rest
}

export function findQuote(id: string) {
  return state.quotes[id]
}

// ---------- Pedidos ----------

export function publicOrder(o: StoredOrder): Order {
  const { outcome: _o, settleAt: _s, ...rest } = o
  return rest
}

export function findOrder(id: string) {
  return state.orders.find((o) => o.id === id)
}

export function findIdempotency(userId: string, key: string) {
  return state.idempotency.find((r) => r.userId === userId && r.key === key)
}

export function createOrder(params: {
  userId: string
  key: string
  requestHash: string
  quote: StoredQuote
  wallet: Wallet
  provider: Wallet['provider']
  collector: Order['collector']
  outcome: 'approve' | 'reject'
  paymentDelayMs: number
}) {
  const { quote } = params
  // Reserva o estoque enquanto o pagamento é processado (evita vender a mesma unidade duas vezes).
  for (const line of quote.lines) {
    const n = findNft(line.nftId)
    const e = n?.editions.find((x) => x.id === line.editionId)
    if (n && e) {
      e.available = Math.max(0, e.available - line.quantity)
      recomputeNft(n)
    }
  }
  const order: StoredOrder = {
    id: nextId('ord'),
    number: `JG-${String(state.orders.length + 1).padStart(5, '0')}`,
    userId: params.userId,
    status: 'pending',
    failureReason: null,
    network: quote.network,
    wallet: { id: params.wallet.id, nickname: params.wallet.nickname, address: params.wallet.address, provider: params.provider },
    collector: params.collector,
    lines: quote.lines.map((l) => ({ ...l })),
    coupon: quote.coupon,
    subtotal: quote.subtotal,
    discount: quote.discount,
    networkFee: quote.networkFee,
    total: quote.total,
    txHash: null,
    explorerUrl: null,
    createdAt: iso(),
    updatedAt: iso(),
    version: 1,
    outcome: params.outcome,
    settleAt: now() + params.paymentDelayMs,
  }
  state.orders.push(order)
  state.idempotency.push({ userId: params.userId, key: params.key, requestHash: params.requestHash, orderId: order.id })
  delete state.quotes[quote.id]
  persist()
  for (const line of quote.lines) {
    const n = findNft(line.nftId)
    if (n) emitNftUpdated(n)
  }
  return order
}

/** Processa pagamentos cujo prazo venceu. Chamado periodicamente e na carga da página. */
export function settleDueOrders() {
  if (!state) return
  const due = state.orders.filter((o) => o.status === 'pending' && o.settleAt <= now())
  for (const order of due) {
    if (order.outcome === 'approve') {
      order.status = 'confirmed'
      order.txHash = `0x${randomHex(32)}`
      order.explorerUrl = explorerUrl(order.network, order.txHash)
      // Remove do carrinho só os itens e quantidades comprados.
      const cart = Object.values(state.carts).find((c) => c.userId === order.userId)
      if (cart) {
        for (const line of order.lines) {
          const item = cart.items.find((i) => i.nftId === line.nftId && i.editionId === line.editionId)
          if (!item) continue
          item.quantity -= line.quantity
        }
        cart.items = cart.items.filter((i) => i.quantity > 0)
        cart.couponCode = null
        touchCart(cart)
      }
    } else {
      order.status = 'rejected'
      order.failureReason = 'Pagamento recusado pela carteira: saldo insuficiente (simulado)'
      // Devolve o estoque reservado.
      for (const line of order.lines) {
        const n = findNft(line.nftId)
        const e = n?.editions.find((x) => x.id === line.editionId)
        if (n && e) {
          e.available += line.quantity
          recomputeNft(n)
          emitNftUpdated(n)
        }
      }
    }
    order.version += 1
    order.updatedAt = iso()
    persist()
    emit({
      type: 'order.updated',
      eventId: nextEventId(),
      occurredAt: iso(),
      version: order.version,
      resource: { type: 'order', id: order.id },
      userId: order.userId,
      data: { status: order.status, failureReason: order.failureReason, txHash: order.txHash },
    })
  }
}

/** Links de exploração simulados (rede de testes de cada blockchain). */
export function explorerUrl(network: Order['network'], txHash: string) {
  if (network === 'polygon') return `https://amoy.polygonscan.com/tx/${txHash}`
  if (network === 'solana') return `https://explorer.solana.com/tx/${txHash}?cluster=devnet`
  return `https://sepolia.etherscan.io/tx/${txHash}`
}

// ---------- Carteiras ----------

export function getWallets(userId: string) {
  return (state.wallets[userId] ??= [])
}

export function upsertWallet(userId: string, input: Omit<Wallet, 'id' | 'updatedAt'>, id?: string) {
  const list = getWallets(userId)
  // Só existe uma principal e uma secundária: cadastrar de novo o mesmo papel substitui.
  const existing = id ? list.find((w) => w.id === id) : list.find((w) => w.role === input.role)
  if (existing) {
    if (existing.role !== input.role) {
      const other = list.find((w) => w.role === input.role && w.id !== existing.id)
      if (other) other.role = existing.role // troca os papéis
    }
    Object.assign(existing, input, { updatedAt: iso() })
    persist()
    return existing
  }
  const wallet: Wallet = { ...input, id: nextId('wal'), updatedAt: iso() }
  list.push(wallet)
  persist()
  return wallet
}
