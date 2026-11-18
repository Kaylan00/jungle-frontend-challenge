import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NftDetail, NftListResponse, NftUpdatedEvent, Order, OrderUpdatedEvent } from '@/api/contracts'
import { qk } from '@/api/queries'
import { sessionStore } from '@/api/session-store'
import { subscribeAnnouncements } from '@/lib/announcer'
import { RealtimeClient } from './client'

/**
 * Socket falso no lugar do socket.io-client: guarda os listeners e deixa o teste disparar
 * eventos do servidor (`serverEmit`) e da conexão (`connectNow`, `drop`).
 */
const fake = vi.hoisted(() => {
  type Fn = (...args: unknown[]) => void
  const makeEmitter = () => {
    const map = new Map<string, Set<Fn>>()
    return {
      map,
      on(event: string, fn: Fn) {
        if (!map.has(event)) map.set(event, new Set())
        map.get(event)!.add(fn)
      },
      off(event?: string) {
        if (event === undefined) map.clear()
        else map.delete(event)
      },
      emit(event: string, ...args: unknown[]) {
        map.get(event)?.forEach((fn) => fn(...args))
      },
      count() {
        let n = 0
        map.forEach((s) => (n += s.size))
        return n
      },
    }
  }
  const create = () => {
    const socketEm = makeEmitter()
    const managerEm = makeEmitter()
    const socket = {
      connected: false,
      connectCalls: 0,
      disconnectCalls: 0,
      io: { on: managerEm.on, off: managerEm.off },
      on: socketEm.on,
      off: socketEm.off,
      connect() {
        socket.connectCalls += 1
      },
      disconnect() {
        socket.disconnectCalls += 1
        if (socket.connected) {
          socket.connected = false
          socketEm.emit('disconnect', 'io client disconnect')
        }
      },
      // Helpers do teste
      connectNow() {
        socket.connected = true
        socketEm.emit('connect')
      },
      drop(reason = 'transport close') {
        socket.connected = false
        socketEm.emit('disconnect', reason)
      },
      serverEmit: socketEm.emit,
      managerEmit: managerEm.emit,
      listenerCount: () => socketEm.count() + managerEm.count(),
    }
    return socket
  }
  return { create, current: null as ReturnType<typeof create> | null }
})

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => {
    fake.current = fake.create()
    return fake.current
  }),
}))

const USER = 'usr-ana'
const NFT_ID = 'nft-1'

function nftDetail(overrides: Partial<NftDetail> = {}): NftDetail {
  return {
    id: NFT_ID,
    name: 'Emerald Ape #042',
    collection: 'Selva',
    creator: { id: 'cr-1', name: 'Nova', avatarUrl: '/a.webp', verified: true },
    image: '/nfts/emerald.webp',
    category: 'arte-digital',
    network: 'ethereum',
    price: '1',
    available: 5,
    compareAtPrice: null,
    tokenId: '42',
    badge: null,
    rating: 4.5,
    reviewsCount: 3,
    likes: 10,
    featured: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    version: 1,
    description: '',
    gallery: [],
    editions: [
      { id: 'ed-1', name: '1/10', price: '1', available: 5, supply: 10, maxPerOrder: 2, status: 'on_sale' },
      { id: 'ed-2', name: '1/50', price: '2', available: 9, supply: 50, maxPerOrder: 5, status: 'on_sale' },
    ],
    attributes: [],
    contract: '0x0',
    tokenStandard: 'ERC-1155',
    ...overrides,
  }
}

function nftEvent(eventId: string, version: number, price: string, available = 4): NftUpdatedEvent {
  return {
    type: 'nft.updated',
    eventId,
    occurredAt: '2026-01-01T00:00:00.000Z',
    version,
    resource: { type: 'nft', id: NFT_ID },
    data: { price, available, editions: [{ id: 'ed-1', price, available, status: 'on_sale' }] },
  }
}

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: 'ord-1',
    number: 'JG-00001',
    userId: USER,
    status: 'pending',
    failureReason: null,
    network: 'ethereum',
    wallet: { id: 'wal-1', nickname: 'Principal', address: `0x${'1'.repeat(40)}`, provider: 'metamask' },
    collector: { displayName: 'Ana', username: 'ana', profileName: 'Ana', email: 'ana@kurio.test', ensName: 'ana', referralCode: 'KURIO', note: '' },
    lines: [],
    coupon: null,
    subtotal: '1',
    discount: '0',
    networkFee: '0.016',
    total: '1.016',
    txHash: null,
    explorerUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    version: 1,
    ...overrides,
  }
}

function orderEvent(eventId: string, version: number, data: Partial<OrderUpdatedEvent['data']> = {}, userId = USER): OrderUpdatedEvent {
  return {
    type: 'order.updated',
    eventId,
    occurredAt: '2026-01-01T00:00:00.000Z',
    version,
    resource: { type: 'order', id: 'ord-1' },
    userId,
    data: { status: 'confirmed', failureReason: null, txHash: '0xabc', ...data },
  }
}

const listKey = ['nfts', 'list', { page: 1 }] as const
function listResponse(version = 1): NftListResponse {
  const { description: _d, gallery: _g, editions: _e, attributes: _a, contract: _c, tokenStandard: _t, ...summary } = nftDetail({ version })
  return {
    items: [summary, { ...summary, id: 'nft-2' }],
    page: 1,
    pageSize: 9,
    total: 2,
    totalPages: 1,
    facets: { category: {}, network: {}, priceRange: { min: '1', max: '1' } },
  }
}

let qc: QueryClient
let client: RealtimeClient
let announced: string[]
let unsubscribeAnnouncements: () => void

function socket() {
  return fake.current!
}

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  client = new RealtimeClient(qc)
  announced = []
  unsubscribeAnnouncements = subscribeAnnouncements((m) => announced.push(m))
})

afterEach(() => {
  client.dispose()
  unsubscribeAnnouncements()
  qc.clear()
  if (sessionStore.getToken()) sessionStore.clear()
})

describe('conexão', () => {
  it('conecta só no start e avisa mudanças de status', () => {
    const statuses: string[] = []
    client.subscribeStatus(() => statuses.push(client.getStatus()))
    expect(socket().connectCalls).toBe(0)
    expect(client.getStatus()).toBe('connecting')

    client.start(null)
    expect(socket().connectCalls).toBe(1)
    socket().connectNow()
    socket().drop()
    socket().managerEmit('reconnect_attempt')
    socket().managerEmit('reconnect_failed')
    expect(statuses).toEqual(['connected', 'reconnecting', 'offline'])
  })

  it('desconexão pedida pelo próprio cliente não conta como queda', () => {
    client.start(null)
    socket().connectNow()
    socket().drop('io client disconnect')
    expect(client.getStatus()).toBe('connected')
  })
})

describe('nft.updated', () => {
  beforeEach(() => {
    client.start(null)
    socket().connectNow()
  })

  it('aplica no detalhe, nas listagens e nos destaques sem nova requisição', () => {
    qc.setQueryData(qk.nftDetail(NFT_ID), nftDetail())
    qc.setQueryData(listKey, listResponse())
    qc.setQueryData(qk.featured, { items: listResponse().items })

    socket().serverEmit('nft.updated', nftEvent('evt-1', 2, '1.5', 3))

    const detail = qc.getQueryData<NftDetail>(qk.nftDetail(NFT_ID))!
    expect(detail).toMatchObject({ price: '1.5', available: 3, version: 2 })
    expect(detail.editions[0]).toMatchObject({ id: 'ed-1', price: '1.5', available: 3 })
    expect(detail.editions[1]).toMatchObject({ id: 'ed-2', price: '2', available: 9 })

    const list = qc.getQueryData<NftListResponse>(listKey)!
    expect(list.items[0]).toMatchObject({ id: NFT_ID, price: '1.5', available: 3, version: 2 })
    expect(list.items[1]).toMatchObject({ id: 'nft-2', price: '1', version: 1 })
    expect(qc.getQueryData<{ items: NftListResponse['items'] }>(qk.featured)!.items[0]).toMatchObject({ price: '1.5', version: 2 })
  })

  it('evento duplicado (mesmo eventId) é ignorado, mesmo com versão maior', () => {
    qc.setQueryData(qk.nftDetail(NFT_ID), nftDetail())
    socket().serverEmit('nft.updated', nftEvent('evt-1', 2, '1.5'))
    socket().serverEmit('nft.updated', nftEvent('evt-1', 3, '9'))
    expect(qc.getQueryData<NftDetail>(qk.nftDetail(NFT_ID))).toMatchObject({ price: '1.5', version: 2 })
  })

  it('evento atrasado (versão menor ou igual à vista) não regride o estado', () => {
    qc.setQueryData(qk.nftDetail(NFT_ID), nftDetail())
    socket().serverEmit('nft.updated', nftEvent('evt-3', 3, '3'))
    socket().serverEmit('nft.updated', nftEvent('evt-2', 2, '2'))
    socket().serverEmit('nft.updated', nftEvent('evt-4', 3, '4'))
    expect(qc.getQueryData<NftDetail>(qk.nftDetail(NFT_ID))).toMatchObject({ price: '3', version: 3 })
    socket().serverEmit('nft.updated', nftEvent('evt-5', 4, '5'))
    expect(qc.getQueryData<NftDetail>(qk.nftDetail(NFT_ID))).toMatchObject({ price: '5', version: 4 })
  })

  it('a versão vinda da REST conta: evento mais velho que o cache é descartado', () => {
    qc.setQueryData(qk.nftDetail(NFT_ID), nftDetail({ version: 10, price: '7' }))
    socket().serverEmit('nft.updated', nftEvent('evt-1', 9, '1'))
    expect(qc.getQueryData<NftDetail>(qk.nftDetail(NFT_ID))).toMatchObject({ price: '7', version: 10 })
  })

  it('a versão máxima vale por recurso, sem afetar outro NFT', () => {
    socket().serverEmit('nft.updated', nftEvent('evt-1', 5, '1'))
    qc.setQueryData(qk.nftDetail('nft-2'), nftDetail({ id: 'nft-2', version: 1 }))
    socket().serverEmit('nft.updated', { ...nftEvent('evt-2', 2, '8'), resource: { type: 'nft', id: 'nft-2' } })
    expect(qc.getQueryData<NftDetail>(qk.nftDetail('nft-2'))).toMatchObject({ price: '8', version: 2 })
  })

  it('evento fora do contrato é ignorado sem quebrar', () => {
    qc.setQueryData(qk.nftDetail(NFT_ID), nftDetail())
    socket().serverEmit('nft.updated', { ...nftEvent('evt-1', 2, '1.5'), data: { price: 1.5 } })
    socket().serverEmit('nft.updated', null)
    socket().serverEmit('nft.updated', nftEvent('evt-2', 2, '-1'))
    expect(qc.getQueryData<NftDetail>(qk.nftDetail(NFT_ID))).toMatchObject({ price: '1', version: 1 })
  })

  it('NFT que está no carrinho: invalida o carrinho e anuncia a mudança', () => {
    const cartKey = qk.cart('guest')
    qc.setQueryData(cartKey, { items: [{ nftId: NFT_ID, name: 'Emerald Ape #042' }] })
    socket().serverEmit('nft.updated', nftEvent('evt-1', 2, '1.5'))
    expect(qc.getQueryState(cartKey)?.isInvalidated).toBe(true)
    expect(announced).toEqual(['Preço ou disponibilidade de Emerald Ape #042 mudou. O resumo do carrinho foi atualizado.'])
  })

  it('NFT fora do carrinho não mexe no carrinho', () => {
    const cartKey = qk.cart('guest')
    qc.setQueryData(cartKey, { items: [{ nftId: 'outro', name: 'Outro' }] })
    socket().serverEmit('nft.updated', nftEvent('evt-1', 2, '1.5'))
    expect(qc.getQueryState(cartKey)?.isInvalidated).toBe(false)
    expect(announced).toEqual([])
  })
})

describe('order.updated', () => {
  const key = qk.order(USER, 'ord-1')

  beforeEach(() => {
    client.start(USER)
    socket().connectNow()
  })

  it('pendente → confirmado: aplica status, txHash e link do explorador, e invalida pedido, carrinho e catálogo', () => {
    qc.setQueryData(key, order())
    qc.setQueryData(qk.cart(USER), { items: [] })
    qc.setQueryData(qk.nftDetail(NFT_ID), nftDetail())

    socket().serverEmit('order.updated', orderEvent('evt-1', 2))

    expect(qc.getQueryData<Order>(key)).toMatchObject({
      status: 'confirmed',
      txHash: '0xabc',
      version: 2,
      explorerUrl: 'https://sepolia.etherscan.io/tx/0xabc',
    })
    expect(qc.getQueryState(key)?.isInvalidated).toBe(true)
    expect(qc.getQueryState(qk.cart(USER))?.isInvalidated).toBe(true)
    expect(qc.getQueryState(qk.nftDetail(NFT_ID))?.isInvalidated).toBe(true)
  })

  it('o link do explorador segue a rede do pedido', () => {
    qc.setQueryData(key, order({ network: 'polygon' }))
    socket().serverEmit('order.updated', orderEvent('evt-1', 2))
    expect(qc.getQueryData<Order>(key)?.explorerUrl).toBe('https://amoy.polygonscan.com/tx/0xabc')
  })

  it('recusado traz o motivo e não tem link', () => {
    qc.setQueryData(key, order())
    socket().serverEmit('order.updated', orderEvent('evt-1', 2, { status: 'rejected', failureReason: 'Saldo insuficiente', txHash: null }))
    expect(qc.getQueryData<Order>(key)).toMatchObject({ status: 'rejected', failureReason: 'Saldo insuficiente', explorerUrl: null })
  })

  it('pedido terminal nunca volta para pendente (nem com versão maior)', () => {
    qc.setQueryData(key, order({ status: 'confirmed', txHash: '0xabc', version: 2 }))
    socket().serverEmit('order.updated', orderEvent('evt-9', 3, { status: 'pending', txHash: null }))
    expect(qc.getQueryData<Order>(key)).toMatchObject({ status: 'confirmed', txHash: '0xabc', version: 2 })

    qc.setQueryData(key, order({ status: 'rejected', version: 4 }))
    socket().serverEmit('order.updated', orderEvent('evt-10', 5, { status: 'confirmed' }))
    expect(qc.getQueryData<Order>(key)).toMatchObject({ status: 'rejected', version: 4 })
  })

  it('evento de pedido antigo ou duplicado é ignorado', () => {
    qc.setQueryData(key, order({ version: 3 }))
    socket().serverEmit('order.updated', orderEvent('evt-1', 2))
    expect(qc.getQueryData<Order>(key)).toMatchObject({ status: 'pending', version: 3 })
    expect(qc.getQueryState(key)?.isInvalidated).toBe(false)
  })

  it('evento de outro usuário é descartado', () => {
    qc.setQueryData(key, order())
    socket().serverEmit('order.updated', orderEvent('evt-1', 2, {}, 'usr-bruno'))
    expect(qc.getQueryData<Order>(key)).toMatchObject({ status: 'pending', version: 1 })
    expect(qc.getQueryState(key)?.isInvalidated).toBe(false)
  })

  it('sem usuário logado, nenhum evento de pedido é aplicado', () => {
    qc.setQueryData(key, order())
    client.setUser(null)
    socket().serverEmit('order.updated', orderEvent('evt-1', 2))
    expect(qc.getQueryData<Order>(key)).toMatchObject({ status: 'pending' })
  })

  it('troca de usuário: eventos do anterior deixam de valer', () => {
    const bobKey = qk.order('usr-bruno', 'ord-1')
    qc.setQueryData(bobKey, order({ userId: 'usr-bruno' }))
    client.setUser('usr-bruno')
    socket().serverEmit('order.updated', orderEvent('evt-1', 2))
    expect(qc.getQueryData<Order>(bobKey)).toMatchObject({ status: 'pending' })
    socket().serverEmit('order.updated', orderEvent('evt-2', 2, {}, 'usr-bruno'))
    expect(qc.getQueryData<Order>(bobKey)).toMatchObject({ status: 'confirmed' })
  })
})

describe('reconexão', () => {
  it('primeira conexão não reconcilia; reconexão invalida e busca de novo só o que está ativo', async () => {
    const nftFn = vi.fn(async () => nftDetail({ version: 7 }))
    const privateFn = vi.fn(async () => order())
    const active = [
      new QueryObserver(qc, { queryKey: qk.nftDetail(NFT_ID), queryFn: nftFn, staleTime: Infinity }),
      new QueryObserver(qc, { queryKey: qk.order(USER, 'ord-1'), queryFn: privateFn, staleTime: Infinity }),
    ]
    const unsubs = active.map((o) => o.subscribe(() => {}))
    await vi.waitFor(() => expect(nftFn).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(privateFn).toHaveBeenCalledTimes(1))
    // Inativa (sem observer): só fica marcada como desatualizada.
    const inactiveFn = vi.fn(async () => ({ items: [] }))
    await qc.prefetchQuery({ queryKey: qk.featured, queryFn: inactiveFn, staleTime: Infinity })
    // Fora de nfts/private: não é tocada.
    qc.setQueryData(qk.session, { token: 't' })

    client.start(USER)
    socket().connectNow()
    expect(announced).toEqual([])
    expect(nftFn).toHaveBeenCalledTimes(1)

    socket().drop()
    expect(client.getStatus()).toBe('reconnecting')
    socket().connectNow()
    expect(client.getStatus()).toBe('connected')

    await vi.waitFor(() => expect(nftFn).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(privateFn).toHaveBeenCalledTimes(2))
    expect(inactiveFn).toHaveBeenCalledTimes(1)
    expect(qc.getQueryState(qk.featured)?.isInvalidated).toBe(true)
    expect(qc.getQueryState(qk.session)?.isInvalidated).toBe(false)
    expect(announced).toEqual(['Conexão em tempo real restabelecida. Dados atualizados.'])
    unsubs.forEach((u) => u())
  })
})

describe('restart (troca de sessão)', () => {
  it('é disparado pela sessão: desconecta, zera o estado por usuário e reconecta', () => {
    client.start(USER)
    socket().connectNow()
    const before = { connect: socket().connectCalls, disconnect: socket().disconnectCalls }

    sessionStore.setToken('tok_novo')

    expect(socket().disconnectCalls).toBe(before.disconnect + 1)
    expect(socket().connectCalls).toBe(before.connect + 1)
    expect(client.getStatus()).toBe('connecting')
  })

  it('limpa ids vistos e versões de pedidos, mas mantém as versões de NFT', () => {
    const key = qk.order(USER, 'ord-1')
    client.start(USER)
    socket().connectNow()
    socket().serverEmit('order.updated', orderEvent('evt-1', 5))
    socket().serverEmit('nft.updated', nftEvent('evt-2', 5, '5'))

    client.restart()
    socket().connectNow()

    // Pedido: versão e eventId zerados → o mesmo evento volta a ser aceito.
    qc.setQueryData(key, order())
    socket().serverEmit('order.updated', orderEvent('evt-1', 5))
    expect(qc.getQueryData<Order>(key)).toMatchObject({ status: 'confirmed', version: 5 })

    // NFT: a versão 5 continua valendo; evento novo com versão menor é descartado.
    qc.setQueryData(qk.nftDetail(NFT_ID), nftDetail({ version: 1 }))
    socket().serverEmit('nft.updated', nftEvent('evt-3', 4, '4'))
    expect(qc.getQueryData<NftDetail>(qk.nftDetail(NFT_ID))).toMatchObject({ price: '1', version: 1 })
  })

  it('a primeira conexão depois do restart não é tratada como reconexão', () => {
    const spy = vi.spyOn(qc, 'invalidateQueries')
    client.start(USER)
    socket().connectNow()
    client.restart()
    socket().connectNow()
    expect(spy).not.toHaveBeenCalled()
    expect(announced).toEqual([])
  })
})

describe('dispose', () => {
  it('libera listeners do socket, do gerenciador, de status e da sessão', () => {
    const statusListener = vi.fn()
    client.subscribeStatus(statusListener)
    client.start(USER)
    expect(socket().listenerCount()).toBeGreaterThan(0)

    client.dispose()

    expect(socket().listenerCount()).toBe(0)
    expect(socket().disconnectCalls).toBeGreaterThan(0)
    const connects = socket().connectCalls
    sessionStore.setToken('tok_depois')
    expect(socket().connectCalls).toBe(connects)

    qc.setQueryData(qk.nftDetail(NFT_ID), nftDetail())
    socket().serverEmit('nft.updated', nftEvent('evt-1', 2, '9'))
    socket().connectNow()
    expect(qc.getQueryData<NftDetail>(qk.nftDetail(NFT_ID))).toMatchObject({ price: '1' })
    expect(statusListener).not.toHaveBeenCalled()
  })
})
