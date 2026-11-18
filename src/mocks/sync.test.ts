/**
 * Propagação entre abas do servidor simulado. Cada "aba" é uma instância própria do módulo db (como cada aba
 * do navegador tem a sua), com o mesmo localStorage, a mesma trava (navigator.locks falso, compartilhado) e o
 * BroadcastChannel do Node (entrega entre instâncias, nunca para quem enviou, como no navegador).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NftUpdatedEvent, OrderUpdatedEvent } from '@/api/contracts'
import { createMemoryStorage } from '@/test/memory-storage'

type Db = typeof import('./db')
type Event = NftUpdatedEvent | OrderUpdatedEvent

/** Web Locks mínimo: uma callback por vez, na ordem dos pedidos (como `navigator.locks.request` exclusivo). */
function fakeLocks() {
  let chain: Promise<unknown> = Promise.resolve()
  return {
    request<T>(_name: string, cb: () => Promise<T>) {
      const run = chain.then(cb)
      chain = run.catch(() => undefined)
      return run
    },
  }
}

async function openTab(): Promise<{ db: Db; events: Event[] }> {
  vi.resetModules()
  const db = await import('./db')
  await db.initDb()
  db.startDbSync()
  const events: Event[] = []
  // Eventos da loja (catálogo e pedidos). O feed do painel (admin.activity) tem testes próprios.
  db.onDbEvent((e) => {
    if (e.type !== 'admin.activity') events.push(e)
  })
  return { db, events }
}

let tabs: Array<{ db: Db }> = []

beforeEach(() => {
  vi.stubGlobal('localStorage', createMemoryStorage())
  vi.stubGlobal('navigator', { locks: fakeLocks() })
  tabs = []
})

afterEach(() => {
  tabs.forEach((t) => t.db.stopDbSync())
})

async function twoTabs() {
  const a = await openTab()
  const b = await openTab()
  tabs.push(a, b)
  return { a, b }
}

/** Dá tempo para mensagens que NÃO deveriam chegar (eco/laço). */
const settle = () => new Promise((r) => setTimeout(r, 30))

describe('propagação entre abas', () => {
  it('a outra aba recarrega o estado e entrega o MESMO evento (mesmo eventId e versão), sem eco', async () => {
    const { a, b } = await twoTabs()
    await a.db.withDb(() => a.db.updateEdition('nft-01', 'nft-01-ed-3', { price: '0.99' }))

    await vi.waitFor(() => expect(b.events).toHaveLength(1))
    const [sent] = a.events
    expect(b.events[0]).toEqual(sent)
    expect(sent).toMatchObject({ type: 'nft.updated', version: 2, data: { price: '0.99', previousPrice: '1.19' } })
    // Estado da aba B veio do storage (não do evento): REST e socket concordam lá também.
    expect(b.db.findNft('nft-01')).toMatchObject({ price: '0.99', version: 2 })

    await settle()
    // Sem laço: B não reenviou; A só tem o próprio evento.
    expect(a.events).toHaveLength(1)
    expect(b.events).toHaveLength(1)
  })

  it('receber não grava nem reenvia (a revisão salva não muda)', async () => {
    const { a, b } = await twoTabs()
    await a.db.withDb(() => a.db.setFeatured('nft-04', true))
    await vi.waitFor(() => expect(b.events).toHaveLength(1))
    const rev = localStorage.getItem('jungle.mock.db.rev')
    await settle()
    expect(localStorage.getItem('jungle.mock.db.rev')).toBe(rev)
    expect(b.db.findNft('nft-04')?.featured).toBe(true)
  })

  it('escritas simultâneas em duas abas não se perdem (transação relê o estado sob a trava)', async () => {
    const { a, b } = await twoTabs()
    const input = (code: string) => ({ code, kind: 'percent' as const, value: '5', expiresAt: null })
    await Promise.all([
      a.db.withDb(() => a.db.createCoupon(input('ABA-A'))),
      b.db.withDb(() => b.db.createCoupon(input('ABA-B'))),
      a.db.withDb(() => a.db.setFavorite('usr-bruno', 'nft-02', true)),
      b.db.withDb(() => b.db.setFavorite('usr-bruno', 'nft-03', true)),
    ])
    for (const tab of [a, b]) {
      await tab.db.withDb(() => undefined)
      expect(tab.db.listCoupons().map((c) => c.code)).toEqual(expect.arrayContaining(['ABA-A', 'ABA-B']))
      expect(tab.db.getFavorites('usr-bruno')).toEqual(['nft-05', 'nft-02', 'nft-03'])
    }
  })

  it('pedido vencido em várias abas: só uma liquida (um evento, mesmo id nas duas abas)', async () => {
    const { a, b } = await twoTabs()
    // Pedido de verdade (cotação + criação), com pagamento já vencido.
    const orderId = await a.db.withDb(async () => {
      const cart = a.db.getOrCreateCart({ userId: 'usr-ana', guestCartId: null })
      a.db.addCartItem(cart, 'nft-02', 'nft-02-ed-2', 1)
      const quote = await a.db.buildQuote('usr-ana', cart, 'ethereum', null)
      if (!quote.ok) throw new Error(quote.message)
      const collector = { displayName: 'Ana', username: 'ana_nft', profileName: 'ana.kurio', email: 'ana@kurio.test', ensName: 'ana-kurio', referralCode: 'KURIO-ANA', note: '' }
      const wallet = a.db.getWallets('usr-ana')[0]
      return a.db.createOrder({ userId: 'usr-ana', key: 'k-1', requestHash: 'h', quote: quote.quote, wallet, provider: 'metamask', collector, outcome: 'approve', paymentDelayMs: 0 }).id
    })
    await vi.waitFor(() => expect(b.db.findOrder(orderId)).toBeDefined())

    await Promise.all([a.db.settleDueOrdersShared(), b.db.settleDueOrdersShared(), a.db.settleDueOrdersShared(), b.db.settleDueOrdersShared()])
    await vi.waitFor(() => expect([...a.events, ...b.events].filter((e) => e.type === 'order.updated')).toHaveLength(2))
    await settle()
    const orderEvents = (tab: { events: Event[] }) => tab.events.filter((e) => e.type === 'order.updated')
    expect(orderEvents(a)).toHaveLength(1)
    expect(orderEvents(b)).toHaveLength(1)
    expect(orderEvents(a)[0].eventId).toBe(orderEvents(b)[0].eventId)
    for (const tab of [a, b]) {
      await tab.db.withDb(() => undefined)
      expect(tab.db.findOrder(orderId)).toMatchObject({ status: 'confirmed', version: 2 })
    }
  })

  it('sessão criada numa aba vale na outra; ids de evento não se repetem entre abas', async () => {
    const { a, b } = await twoTabs()
    const session = await a.db.withDb(() => a.db.createSession('usr-ana', 60))
    expect(b.db.lookupSession(session.token).status).toBe('missing')
    b.db.refreshFromStorage()
    expect(b.db.lookupSession(session.token)).toMatchObject({ status: 'ok', user: { id: 'usr-ana' } })

    await a.db.withDb(() => a.db.updateEdition('nft-02', 'nft-02-ed-1', { price: '1.5' }))
    await b.db.withDb(() => b.db.updateEdition('nft-02', 'nft-02-ed-2', { price: '0.9' }))
    await vi.waitFor(() => expect(a.events).toHaveLength(2))
    const ids = a.events.map((e) => e.eventId)
    expect(new Set(ids).size).toBe(2)
    expect(a.events.map((e) => e.version)).toEqual([2, 3])
  })

  it('reset numa aba: as outras recarregam a seed e derrubam as conexões', async () => {
    const { a, b } = await twoTabs()
    const dropped = vi.fn()
    b.db.onRemoteReset(dropped)
    await b.db.withDb(() => b.db.updateEdition('nft-01', 'nft-01-ed-3', { price: '9' }))
    await a.db.withDb(() => a.db.resetDb())
    await vi.waitFor(() => expect(dropped).toHaveBeenCalledTimes(1))
    expect(b.db.findNft('nft-01')).toMatchObject({ price: '1.19', version: 1 })
  })

  it('mensagem velha ou da própria aba é ignorada', async () => {
    const { a } = await twoTabs()
    const before = a.events.length
    a.db.receiveSyncMessage({ from: a.db.TAB_ID, rev: 999, events: [{} as Event] })
    expect(a.events).toHaveLength(before)
  })
})
