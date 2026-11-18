import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateOrderInput, type CreateOrderInput as CreateOrderBody } from '@/api/contracts'
import { createMemoryStorage } from '@/test/memory-storage'
import * as db from './db'

const STORAGE_KEY = 'jungle.mock.db.v1'
const ANA = 'usr-ana'
const BRUNO = 'usr-bruno'
const T0 = new Date('2026-06-01T12:00:00.000Z')

let storage: Storage

beforeEach(async () => {
  storage = createMemoryStorage()
  vi.stubGlobal('localStorage', storage)
  // Só o relógio é falso (Date.now); timers e crypto.subtle continuam reais.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
  await db.resetDb()
})

afterEach(() => {
  vi.useRealTimers()
})

function advance(ms: number) {
  vi.setSystemTime(Date.now() + ms)
}

function anaCart() {
  return db.getOrCreateCart({ userId: ANA, guestCartId: null })
}

function edition(nftId: string, editionId: string) {
  return db.findNft(nftId)!.editions.find((e) => e.id === editionId)!
}

/** Eventos da loja (catálogo e pedidos). O feed do painel (admin.activity) tem testes próprios. */
function collectEvents() {
  const events: Array<Exclude<db.DbEvent, { type: 'admin.activity' }>> = []
  const off = db.onDbEvent((e) => {
    if (e.type !== 'admin.activity') events.push(e)
  })
  return { events, off }
}

describe('cupom', () => {
  it('válido, com espaços e minúsculas', () => {
    expect(db.checkCoupon('KURIO10')).toEqual({ ok: true, coupon: { code: 'KURIO10', description: expect.any(String), percentOff: '10', amountOff: null } })
    expect(db.checkCoupon('  genesis25 ')).toMatchObject({ ok: true, coupon: { code: 'GENESIS25', percentOff: '25' } })
  })

  it('inexistente é inválido', () => {
    for (const code of ['NOPE', '', 'KURIO 10', 'KURIO100']) expect(db.checkCoupon(code)).toMatchObject({ ok: false, code: 'COUPON_INVALID' })
  })

  it('expira pelo relógio do servidor (vale até o instante exato do vencimento)', () => {
    expect(db.checkCoupon('BLACK2025')).toMatchObject({ ok: false, code: 'COUPON_EXPIRED' })
    vi.setSystemTime(new Date('2025-11-30T23:59:59.000Z'))
    expect(db.checkCoupon('BLACK2025')).toMatchObject({ ok: true, coupon: { percentOff: '30' } })
    advance(1)
    expect(db.checkCoupon('BLACK2025')).toMatchObject({ ok: false, code: 'COUPON_EXPIRED' })
  })

  it('cupom aplicado que expira depois deixa de dar desconto no carrinho', () => {
    vi.setSystemTime(new Date('2025-11-29T12:00:00.000Z'))
    const cart = anaCart()
    db.addCartItem(cart, 'nft-02', 'nft-02-ed-2', 1)
    db.setCartCoupon(cart, 'BLACK2025')
    expect(db.serializeCart(cart)).toMatchObject({ coupon: { code: 'BLACK2025' }, summary: { subtotal: '0.95', discount: '0.285' } })

    vi.setSystemTime(new Date('2025-12-01T00:00:00.000Z'))
    expect(db.serializeCart(cart)).toMatchObject({ coupon: null, summary: { subtotal: '0.95', discount: '0', total: '0.966' } })
  })

  it('cotação recusa cupom inválido ou expirado', async () => {
    const cart = anaCart()
    db.addCartItem(cart, 'nft-02', 'nft-02-ed-2', 1)
    await expect(db.buildQuote(ANA, cart, 'ethereum', 'NOPE')).resolves.toMatchObject({ ok: false, code: 'COUPON_INVALID' })
    await expect(db.buildQuote(ANA, cart, 'ethereum', 'BLACK2025')).resolves.toMatchObject({ ok: false, code: 'COUPON_EXPIRED' })
  })
})

describe('carrinho e estoque', () => {
  it('limita pela menor medida entre estoque e limite por pedido', () => {
    const cart = anaCart()
    // nft-01-ed-2: 4 disponíveis, máximo 2 por pedido
    expect(db.addCartItem(cart, 'nft-01', 'nft-01-ed-2', 3)).toMatchObject({ code: 'AVAILABILITY_CONFLICT', available: 2 })
    expect(db.addCartItem(cart, 'nft-01', 'nft-01-ed-2', 2)).toBeNull()
    // Somar ao que já está no carrinho também respeita o limite.
    expect(db.addCartItem(cart, 'nft-01', 'nft-01-ed-2', 1)).toMatchObject({ code: 'AVAILABILITY_CONFLICT', available: 2 })
    expect(cart.items).toHaveLength(1)
  })

  it('edição esgotada, indisponível ou inexistente', () => {
    const cart = anaCart()
    expect(db.addCartItem(cart, 'nft-01', 'nft-01-ed-4', 1)).toMatchObject({ code: 'AVAILABILITY_CONFLICT', available: 0 })
    expect(db.addCartItem(cart, 'nft-03', 'nft-03-ed-x', 1)).toMatchObject({ code: 'AVAILABILITY_CONFLICT' })
    expect(db.addCartItem(cart, 'nft-01', 'nao-existe', 1)).toMatchObject({ code: 'NOT_FOUND' })
    expect(db.addCartItem(cart, 'nao-existe', 'nft-01-ed-1', 1)).toMatchObject({ code: 'NOT_FOUND' })
    expect(cart.items).toHaveLength(0)
  })

  it('o carrinho acusa preço alterado, estoque insuficiente e esgotado (e esgotado sai do subtotal)', () => {
    const cart = anaCart()
    db.addCartItem(cart, 'nft-01', 'nft-01-ed-3', 2)
    db.addCartItem(cart, 'nft-02', 'nft-02-ed-2', 1)
    db.addCartItem(cart, 'nft-03', 'nft-03-ed-1', 2)
    db.updateEdition('nft-01', 'nft-01-ed-3', { price: '1.25' })
    db.updateEdition('nft-02', 'nft-02-ed-2', { available: 0 })
    db.updateEdition('nft-03', 'nft-03-ed-1', { available: 1 })

    const serialized = db.serializeCart(cart)
    expect(serialized.items.map((i) => i.issue)).toEqual(['price_changed', 'sold_out', 'insufficient_stock'])
    // 1.25 x 2 + 1.99 x 2 (o esgotado não entra)
    expect(serialized.summary.subtotal).toBe('6.48')
    expect(db.updateCartItem(cart, cart.items[2].id, 2)).toMatchObject({ code: 'AVAILABILITY_CONFLICT', available: 1 })
    expect(db.updateCartItem(cart, cart.items[2].id, 1)).toBeNull()
    expect(db.serializeCart(cart).items[2].issue).toBeNull()
  })

  it('estoque negativo é corrigido para zero', () => {
    db.updateEdition('nft-02', 'nft-02-ed-2', { available: -5 })
    expect(edition('nft-02', 'nft-02-ed-2')).toMatchObject({ available: 0, status: 'sold_out' })
  })
})

describe('cotação', () => {
  async function quoteFor(network: 'ethereum' | 'polygon' | 'solana' = 'ethereum', coupon: string | null = 'KURIO10') {
    const r = await db.buildQuote(ANA, anaCart(), network, coupon)
    if (!r.ok) throw new Error(r.message)
    return r.quote
  }

  beforeEach(() => {
    const cart = anaCart()
    db.addCartItem(cart, 'nft-01', 'nft-01-ed-3', 2) // 1.19 x 2
    db.addCartItem(cart, 'nft-02', 'nft-02-ed-2', 1) // 0.95
  })

  it('totais exatos: subtotal, desconto, taxa da rede e total', async () => {
    const q = await quoteFor()
    expect(q.lines.map((l) => l.lineTotal)).toEqual(['2.38', '0.95'])
    expect(q).toMatchObject({ subtotal: '3.33', discount: '0.333', networkFee: '0.016', total: '3.013', network: 'ethereum' })
    expect(q.fingerprint).toMatch(/^[0-9a-f]{24}$/)
    expect(Date.parse(q.expiresAt) - Date.now()).toBe(10 * 60_000)
  })

  it('carrinho vazio não gera cotação', async () => {
    const empty = db.getOrCreateCart({ userId: BRUNO, guestCartId: null })
    await expect(db.buildQuote(BRUNO, empty, 'ethereum', null)).resolves.toMatchObject({ ok: false, code: 'VALIDATION_ERROR' })
  })

  it('mesmo conteúdo = mesmo fingerprint (ids diferentes)', async () => {
    const a = await quoteFor()
    const b = await quoteFor()
    expect(a.id).not.toBe(b.id)
    expect(a.fingerprint).toBe(b.fingerprint)
  })

  it('fingerprint muda quando o preço muda e volta quando o preço volta', async () => {
    const original = await quoteFor()
    db.updateEdition('nft-01', 'nft-01-ed-3', { price: '1.20' })
    const changed = await quoteFor()
    expect(changed.fingerprint).not.toBe(original.fingerprint)
    expect(changed.total).not.toBe(original.total)
    db.updateEdition('nft-01', 'nft-01-ed-3', { price: '1.19' })
    expect((await quoteFor()).fingerprint).toBe(original.fingerprint)
  })

  it('fingerprint muda com a rede (taxa) e com o cupom', async () => {
    const eth = await quoteFor('ethereum')
    const polygon = await quoteFor('polygon')
    expect(polygon.networkFee).toBe('0.0004')
    expect(polygon.fingerprint).not.toBe(eth.fingerprint)
    expect((await quoteFor('ethereum', null)).fingerprint).not.toBe(eth.fingerprint)
    expect((await quoteFor('ethereum', 'GENESIS25')).fingerprint).not.toBe(eth.fingerprint)
  })

  it('estoque que ainda cobre a quantidade não invalida a cotação', async () => {
    const before = await quoteFor()
    db.updateEdition('nft-01', 'nft-01-ed-3', { available: 5 })
    expect((await quoteFor()).fingerprint).toBe(before.fingerprint)
  })

  it('quantidade acima do disponível ou edição esgotada: conflito com o disponível de cada item', async () => {
    const cart = anaCart()
    db.updateEdition('nft-01', 'nft-01-ed-3', { available: 1 })
    db.updateEdition('nft-02', 'nft-02-ed-2', { available: 0 })
    const r = await db.buildQuote(ANA, cart, 'ethereum', null)
    expect(r).toMatchObject({
      ok: false,
      code: 'AVAILABILITY_CONFLICT',
      details: [
        { itemId: cart.items[0].id, available: 1 },
        { itemId: cart.items[1].id, available: 0 },
      ],
    })
  })
})

describe('pedido: idempotência e estoque reservado', () => {
  const body: CreateOrderBody = {
    quoteId: 'qt-x',
    fingerprint: 'fp',
    walletId: 'wal-ana-1',
    network: 'ethereum',
    provider: 'metamask',
    collector: { displayName: 'Ana', username: 'ana_nft', profileName: 'ana.kurio', email: 'ana@kurio.test', ensName: 'ana-kurio', referralCode: 'KURIO-ANA', note: '' },
  }

  async function placeOrder(opts: { key?: string; outcome?: 'approve' | 'reject'; delay?: number } = {}) {
    const cart = anaCart()
    const r = await db.buildQuote(ANA, cart, 'ethereum', 'KURIO10')
    if (!r.ok) throw new Error(r.message)
    const order = db.createOrder({
      userId: ANA,
      key: opts.key ?? 'key-1',
      requestHash: await db.stableHash(CreateOrderInput.parse({ ...body, quoteId: r.quote.id, fingerprint: r.quote.fingerprint })),
      quote: r.quote,
      wallet: db.getWallets(ANA)[0],
      provider: 'metamask',
      collector: body.collector,
      outcome: opts.outcome ?? 'approve',
      paymentDelayMs: opts.delay ?? 1_000,
    })
    return { order, quote: r.quote }
  }

  beforeEach(() => {
    const cart = anaCart()
    db.addCartItem(cart, 'nft-01', 'nft-01-ed-3', 2)
    db.addCartItem(cart, 'nft-02', 'nft-02-ed-2', 1)
  })

  it('hash do pedido: mesmo conteúdo (em qualquer ordem de campos) = mesmo hash; conteúdo diferente = outro hash', async () => {
    const reordered = { collector: { ...body.collector }, provider: body.provider, network: body.network, walletId: body.walletId, fingerprint: body.fingerprint, quoteId: body.quoteId }
    const h1 = await db.stableHash(CreateOrderInput.parse(body))
    expect(await db.stableHash(CreateOrderInput.parse(reordered))).toBe(h1)
    expect(await db.stableHash(CreateOrderInput.parse({ ...body, collector: { ...body.collector, note: 'presente' } }))).not.toBe(h1)
    expect(await db.stableHash(CreateOrderInput.parse({ ...body, walletId: 'wal-ana-2' }))).not.toBe(h1)
  })

  it('a chave fica registrada por usuário e aponta sempre para o mesmo pedido', async () => {
    const { order } = await placeOrder({ key: 'idem-1' })
    const record = db.findIdempotency(ANA, 'idem-1')
    expect(record).toMatchObject({ orderId: order.id })
    expect(db.findOrder(record!.orderId)).toBe(order)
    expect(db.findIdempotency(ANA, 'idem-1')?.orderId).toBe(order.id)
    expect(db.findIdempotency(BRUNO, 'idem-1')).toBeUndefined()
    expect(db.findIdempotency(ANA, 'outra')).toBeUndefined()
    expect(db.getState().orders).toHaveLength(1)
  })

  it('o hash guardado com a chave permite detectar conteúdo diferente com a mesma chave', async () => {
    await placeOrder({ key: 'idem-1' })
    const record = db.findIdempotency(ANA, 'idem-1')!
    const other = await db.stableHash(CreateOrderInput.parse({ ...body, collector: { ...body.collector, note: 'mudou' } }))
    expect(record.requestHash).not.toBe(other)
  })

  it('criar o pedido reserva o estoque, consome a cotação e publica nft.updated', async () => {
    const before = { ed3: edition('nft-01', 'nft-01-ed-3').available, version: db.findNft('nft-01')!.version }
    const { events, off } = collectEvents()
    const { order, quote } = await placeOrder()
    off()

    expect(order).toMatchObject({ status: 'pending', version: 1, total: '3.013', txHash: null })
    expect(edition('nft-01', 'nft-01-ed-3').available).toBe(before.ed3 - 2)
    expect(edition('nft-02', 'nft-02-ed-2').available).toBe(21)
    expect(db.findNft('nft-01')!.version).toBe(before.version + 1)
    expect(db.findQuote(quote.id)).toBeUndefined()
    expect(events.map((e) => [e.type, e.resource.id])).toEqual([
      ['nft.updated', 'nft-01'],
      ['nft.updated', 'nft-02'],
    ])
  })

  it('reserva nunca deixa estoque negativo', async () => {
    const r = await db.buildQuote(ANA, anaCart(), 'ethereum', null)
    if (!r.ok) throw new Error(r.message)
    db.updateEdition('nft-01', 'nft-01-ed-3', { available: 1 })
    db.createOrder({ userId: ANA, key: 'k', requestHash: 'h', quote: r.quote, wallet: db.getWallets(ANA)[0], provider: 'metamask', collector: body.collector, outcome: 'approve', paymentDelayMs: 0 })
    expect(edition('nft-01', 'nft-01-ed-3')).toMatchObject({ available: 0, status: 'sold_out' })
  })

  it('não liquida antes do prazo', async () => {
    const { order } = await placeOrder({ delay: 5_000 })
    advance(4_999)
    db.settleDueOrders()
    expect(order.status).toBe('pending')
  })

  it('pagamento recusado devolve o estoque reservado e publica os eventos', async () => {
    const stock = edition('nft-01', 'nft-01-ed-3').available
    const { order } = await placeOrder({ outcome: 'reject' })
    expect(edition('nft-01', 'nft-01-ed-3').available).toBe(stock - 2)

    const { events, off } = collectEvents()
    advance(1_000)
    db.settleDueOrders()
    off()

    expect(order).toMatchObject({ status: 'rejected', version: 2, txHash: null, explorerUrl: null })
    expect(order.failureReason).toMatch(/recusado/)
    expect(edition('nft-01', 'nft-01-ed-3').available).toBe(stock)
    expect(edition('nft-02', 'nft-02-ed-2').available).toBe(22)
    expect(events.at(-1)).toMatchObject({ type: 'order.updated', userId: ANA, version: 2, data: { status: 'rejected' } })
    // O carrinho continua com os itens para tentar de novo.
    expect(anaCart().items).toHaveLength(2)
  })

  it('pagamento aprovado confirma, mantém a reserva e tira do carrinho só o que foi comprado', async () => {
    const { order } = await placeOrder()
    const cart = anaCart()
    db.setCartCoupon(cart, 'KURIO10')
    // Depois do pedido, a Ana pôs mais uma unidade no carrinho: ela fica.
    db.addCartItem(cart, 'nft-02', 'nft-02-ed-2', 1)
    const stock = edition('nft-01', 'nft-01-ed-3').available

    advance(1_000)
    db.settleDueOrders()

    expect(order.status).toBe('confirmed')
    expect(order.txHash).toMatch(/^0x[0-9a-f]{64}$/)
    expect(order.explorerUrl).toBe(`https://sepolia.etherscan.io/tx/${order.txHash}`)
    expect(edition('nft-01', 'nft-01-ed-3').available).toBe(stock)
    expect(cart.items.map((i) => [i.editionId, i.quantity])).toEqual([['nft-02-ed-2', 1]])
    expect(cart.couponCode).toBeNull()
  })

  it('pedido já liquidado não é processado de novo', async () => {
    await placeOrder()
    advance(1_000)
    db.settleDueOrders()
    const { events, off } = collectEvents()
    advance(10_000)
    db.settleDueOrders()
    off()
    expect(events).toEqual([])
  })
})

describe('senha', () => {
  it('hash SHA-256 com salt: determinístico, muda com o salt e nunca guarda a senha', async () => {
    const h = await db.hashPassword('Selva2026!', 'salt-a')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(await db.hashPassword('Selva2026!', 'salt-a')).toBe(h)
    expect(await db.hashPassword('Selva2026!', 'salt-b')).not.toBe(h)
    expect(await db.hashPassword('Selva2026?', 'salt-a')).not.toBe(h)
  })

  it('usuários da seed: salt próprio, senha confere e não aparece no estado salvo', async () => {
    const ana = db.findUserByEmail('ANA@kurio.test')!
    const bruno = db.findUserByEmail('bruno@kurio.test')!
    expect(ana.salt).not.toBe(bruno.salt)
    expect(await db.verifyPassword(ana, 'Selva2026!')).toBe(true)
    expect(await db.verifyPassword(ana, 'selva2026!')).toBe(false)
    expect(await db.verifyPassword(ana, '')).toBe(false)
    const saved = storage.getItem(STORAGE_KEY)!
    expect(saved).not.toContain('Selva2026!')
    expect(saved).not.toContain('Pixel2026!')
    expect(db.publicUser(ana)).not.toHaveProperty('passwordHash')
    expect(db.publicUser(ana)).not.toHaveProperty('salt')
  })

  it('trocar a senha troca o salt e invalida a anterior', async () => {
    const user = await db.createUser({ username: 'carla_1', email: 'carla@kurio.test', password: 'Carla2026' })
    const oldSalt = user.salt
    await db.setPassword(user, 'Nova2026x')
    expect(user.salt).not.toBe(oldSalt)
    expect(await db.verifyPassword(user, 'Carla2026')).toBe(false)
    expect(await db.verifyPassword(user, 'Nova2026x')).toBe(true)
  })
})

describe('sessão', () => {
  it('ok, inexistente e expirada', () => {
    const s = db.createSession(ANA, 60)
    expect(db.lookupSession(s.token)).toMatchObject({ status: 'ok', user: { id: ANA } })
    expect(db.lookupSession(null)).toEqual({ status: 'missing' })
    expect(db.lookupSession('tok_falso')).toEqual({ status: 'missing' })
    advance(60_000)
    expect(db.lookupSession(s.token)).toEqual({ status: 'expired' })
  })
})

describe('token de redefinição de senha', () => {
  it('guarda só o hash do token', async () => {
    const token = await db.createPasswordReset(ANA)
    expect(token).toMatch(/^rst_[0-9a-f]{48}$/)
    expect(storage.getItem(STORAGE_KEY)).not.toContain(token)
    expect(db.getState().passwordResets).toHaveLength(1)
  })

  it('vale por 30 minutos', async () => {
    const token = await db.createPasswordReset(ANA)
    advance(db.PASSWORD_RESET_TTL_MIN * 60_000 - 1)
    expect(await db.lookupPasswordReset(token)).toMatchObject({ status: 'ok', user: { id: ANA } })
    advance(1)
    expect(await db.lookupPasswordReset(token)).toEqual({ status: 'expired' })
  })

  it('token desconhecido é inválido', async () => {
    await db.createPasswordReset(ANA)
    expect(await db.lookupPasswordReset(`rst_${'0'.repeat(48)}`)).toEqual({ status: 'invalid' })
    expect(await db.lookupPasswordReset('')).toEqual({ status: 'invalid' })
  })

  it('uso único: troca a senha, encerra as sessões do usuário e não vale de novo', async () => {
    const anaSession = db.createSession(ANA, 3600)
    const brunoSession = db.createSession(BRUNO, 3600)
    const token = await db.createPasswordReset(ANA)
    const found = await db.lookupPasswordReset(token)
    if (found.status !== 'ok') throw new Error(found.status)

    await db.completePasswordReset(found.reset, found.user, 'NovaSenha2026')

    expect(await db.verifyPassword(db.findUser(ANA)!, 'NovaSenha2026')).toBe(true)
    expect(await db.verifyPassword(db.findUser(ANA)!, 'Selva2026!')).toBe(false)
    expect(db.lookupSession(anaSession.token).status).toBe('missing')
    expect(db.lookupSession(brunoSession.token).status).toBe('ok')
    expect(await db.lookupPasswordReset(token)).toEqual({ status: 'used' })
    // Usado continua "usado" mesmo depois de vencer.
    advance(60 * 60_000)
    expect(await db.lookupPasswordReset(token)).toEqual({ status: 'used' })
  })

  it('pedido novo substitui o anterior (só o último link vale), sem afetar outro usuário', async () => {
    const first = await db.createPasswordReset(ANA)
    const bruno = await db.createPasswordReset(BRUNO)
    const second = await db.createPasswordReset(ANA)
    expect(await db.lookupPasswordReset(first)).toEqual({ status: 'superseded' })
    expect(await db.lookupPasswordReset(second)).toMatchObject({ status: 'ok' })
    expect(await db.lookupPasswordReset(bruno)).toMatchObject({ status: 'ok' })
  })

  it('expirePasswordResets vence os links pendentes', async () => {
    const token = await db.createPasswordReset(ANA)
    db.expirePasswordResets()
    expect(await db.lookupPasswordReset(token)).toEqual({ status: 'expired' })
  })
})

describe('initDb e estado salvo (isUsableState)', () => {
  async function freshDb(saved?: string) {
    vi.resetModules()
    const s = createMemoryStorage(saved === undefined ? {} : { [STORAGE_KEY]: saved })
    vi.stubGlobal('localStorage', s)
    const mod = await import('./db')
    await mod.initDb()
    return { mod, storage: s }
  }

  function validSaved(patch: (s: db.DbState) => void = () => {}) {
    const s = structuredClone(db.getState())
    s.seq = 4242
    patch(s)
    return JSON.stringify(s)
  }

  it('sem estado salvo: cria a seed e persiste', async () => {
    const { mod, storage: s } = await freshDb()
    expect(mod.getState().users.map((u) => u.id)).toEqual(['usr-admin', ANA, BRUNO])
    expect(mod.getState().nfts).toHaveLength(36)
    expect(JSON.parse(s.getItem(STORAGE_KEY)!).seq).toBe(1000)
  })

  it('estado salvo válido é reaproveitado', async () => {
    const { mod } = await freshDb(validSaved())
    expect(mod.getState().seq).toBe(4242)
  })

  it('estado de antes da recuperação de senha (sem passwordResets/outbox) ainda serve', async () => {
    const { mod } = await freshDb(
      validSaved((s) => {
        delete s.passwordResets
        delete s.outbox
      }),
    )
    expect(mod.getState().seq).toBe(4242)
    const token = await mod.createPasswordReset(ANA)
    expect(await mod.lookupPasswordReset(token)).toMatchObject({ status: 'ok' })
  })

  // Funções: o estado de referência só existe depois do beforeEach (resetDb).
  it.each<[string, () => string]>([
    ['JSON corrompido', () => '{"schema":1,'],
    ['null', () => 'null'],
    ['schema de outra versão', () => validSaved((s) => ((s as { schema: number }).schema = 2))],
    ['sem usuários', () => validSaved((s) => delete (s as Partial<db.DbState>).users)],
    ['sem pedidos', () => validSaved((s) => delete (s as Partial<db.DbState>).orders)],
    ['catálogo vazio', () => validSaved((s) => (s.nfts = []))],
    ['NFT fora do contrato (preço numérico)', () => validSaved((s) => ((s.nfts[3] as { price: unknown }).price = 1.5))],
    ['NFT sem campo novo do contrato', () => validSaved((s) => delete (s.nfts[0] as Partial<(typeof s.nfts)[0]>).gallery)],
  ])('%s: recria a seed', async (_label, saved) => {
    const { mod, storage: s } = await freshDb(saved())
    expect(mod.getState().seq).toBe(1000)
    expect(mod.getState().nfts).toHaveLength(36)
    expect(JSON.parse(s.getItem(STORAGE_KEY)!).seq).toBe(1000)
  })

  it('chamadas repetidas compartilham a mesma inicialização', async () => {
    const { mod } = await freshDb()
    expect(mod.initDb()).toBe(mod.initDb())
  })

  it('localStorage indisponível: segue só em memória', async () => {
    vi.resetModules()
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    })
    const mod = await import('./db')
    await mod.initDb()
    expect(mod.getState().nfts).toHaveLength(36)
  })
})
