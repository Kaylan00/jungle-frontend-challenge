/**
 * Cliente de tempo real (socket.io-client).
 *
 * Garantias:
 *  1. Duplicata: cada evento tem `eventId`; ids já aplicados são ignorados.
 *  2. Evento antigo: guardamos a maior versão vista por recurso; versão <= vista é ignorada,
 *     então um evento atrasado nunca regride um estado mais novo.
 *  3. Pedido terminal (confirmado/recusado) nunca volta para pendente.
 *  4. Reconexão: ao reconectar, os recursos ativos são reconciliados com a API REST
 *     (eventos perdidos durante a queda não importam: a REST é a fonte da verdade).
 *  5. Sessão: o socket se autentica com o token; ao trocar de usuário ele é desconectado,
 *     o estado de eventos de pedido é zerado e só então reconecta com o novo token.
 *     Eventos de pedido de outro userId são descartados mesmo que cheguem.
 */
import type { QueryClient } from '@tanstack/react-query'
import { io, type Socket } from 'socket.io-client'
import { NftUpdatedEvent, OrderUpdatedEvent, SOCKET_EVENTS, type NftDetail, type NftListResponse, type Order } from '@/api/contracts'
import { qk } from '@/api/queries'
import { sessionStore } from '@/api/session-store'
import { announce } from '@/lib/announcer'

export type RealtimeStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline'

export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? 'wss://realtime.jungle.mock'

const MAX_SEEN = 500

export class RealtimeClient {
  private socket: Socket
  private seen = new Set<string>()
  private versions = new Map<string, number>()
  private status: RealtimeStatus = 'connecting'
  private statusListeners = new Set<() => void>()
  private hadConnection = false
  private userId: string | null = null
  private unsubscribeSession: () => void
  private readonly queryClient: QueryClient

  constructor(queryClient: QueryClient) {
    this.queryClient = queryClient
    this.socket = io(SOCKET_URL, {
      // Ver ARCHITECTURE.md: o mock intercepta só WebSocket, não long-polling.
      transports: ['websocket'],
      autoConnect: false,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4_000,
      // Função: o token é lido a cada (re)conexão, nunca fica congelado.
      auth: (cb) => cb({ token: sessionStore.getToken() }),
    })

    this.socket.on('connect', this.onConnect)
    this.socket.on('disconnect', this.onDisconnect)
    this.socket.io.on('reconnect_attempt', () => this.setStatus('reconnecting'))
    this.socket.io.on('reconnect_failed', () => this.setStatus('offline'))
    this.socket.on(SOCKET_EVENTS.nftUpdated, this.onNftUpdated)
    this.socket.on(SOCKET_EVENTS.orderUpdated, this.onOrderUpdated)

    this.unsubscribeSession = sessionStore.subscribe(() => this.restart())
  }

  start(userId: string | null) {
    this.userId = userId
    this.socket.connect()
  }

  setUser(userId: string | null) {
    this.userId = userId
  }

  /** Reinicia a conexão com as credenciais atuais (troca de usuário/logout). */
  restart() {
    // Zera o que é por usuário: versões de pedidos e eventos vistos.
    for (const key of this.versions.keys()) if (key.startsWith('order:')) this.versions.delete(key)
    this.seen.clear()
    this.socket.disconnect()
    this.hadConnection = false
    this.setStatus('connecting')
    this.socket.connect()
  }

  dispose() {
    this.unsubscribeSession()
    this.socket.off()
    this.socket.io.off()
    this.socket.disconnect()
    this.statusListeners.clear()
  }

  getStatus = () => this.status

  subscribeStatus = (fn: () => void) => {
    this.statusListeners.add(fn)
    return () => {
      this.statusListeners.delete(fn)
    }
  }

  private setStatus(next: RealtimeStatus) {
    if (this.status === next) return
    this.status = next
    this.statusListeners.forEach((l) => l())
  }

  private onConnect = () => {
    const isReconnect = this.hadConnection
    this.hadConnection = true
    this.setStatus('connected')
    if (isReconnect) {
      // Reconciliação: tudo que está na tela é conferido com a REST.
      void this.queryClient.invalidateQueries({ queryKey: qk.nfts, refetchType: 'active' })
      void this.queryClient.invalidateQueries({ queryKey: qk.private, refetchType: 'active' })
      announce('Conexão em tempo real restabelecida. Dados atualizados.')
    }
  }

  private onDisconnect = (reason: Socket.DisconnectReason) => {
    // Desconexão pedida pelo próprio cliente (troca de sessão) não é "queda".
    if (reason === 'io client disconnect') return
    this.setStatus('reconnecting')
  }

  /** true = aplicar; false = duplicata ou antigo. */
  private accept(eventId: string, resourceKey: string, version: number) {
    if (this.seen.has(eventId)) return false
    const current = this.versions.get(resourceKey) ?? 0
    if (version <= current) return false
    this.seen.add(eventId)
    if (this.seen.size > MAX_SEEN) this.seen.delete(this.seen.values().next().value!)
    this.versions.set(resourceKey, version)
    return true
  }

  /** Registra a versão conhecida via REST, para que eventos mais velhos que ela sejam descartados. */
  noteVersion(resourceKey: string, version: number) {
    const current = this.versions.get(resourceKey) ?? 0
    if (version > current) this.versions.set(resourceKey, version)
  }

  private onNftUpdated = (raw: unknown) => {
    const parsed = NftUpdatedEvent.safeParse(raw)
    if (!parsed.success) return
    const e = parsed.data
    const nftId = e.resource.id
    // Considera a versão que o cache já tem (veio da REST).
    const cached = this.queryClient.getQueryData<NftDetail>(qk.nftDetail(nftId))
    if (cached) this.noteVersion(`nft:${nftId}`, cached.version)
    if (!this.accept(e.eventId, `nft:${nftId}`, e.version)) return

    // Detalhe: aplica direto no cache (sem nova requisição).
    this.queryClient.setQueryData<NftDetail>(qk.nftDetail(nftId), (old) => {
      if (!old || old.version >= e.version) return old
      const editions = old.editions.map((ed) => {
        const upd = e.data.editions.find((x) => x.id === ed.id)
        return upd ? { ...ed, ...upd } : ed
      })
      return { ...old, price: e.data.price, available: e.data.available, editions, version: e.version }
    })

    // Listagens: atualiza o card onde ele aparecer.
    this.queryClient.setQueriesData<NftListResponse>({ queryKey: ['nfts', 'list'] }, (old) =>
      old
        ? {
            ...old,
            items: old.items.map((n) =>
              n.id === nftId && n.version < e.version ? { ...n, price: e.data.price, available: e.data.available, version: e.version } : n,
            ),
          }
        : old,
    )
    this.queryClient.setQueryData<{ items: NftListResponse['items'] }>(qk.featured, (old) =>
      old
        ? { items: old.items.map((n) => (n.id === nftId && n.version < e.version ? { ...n, price: e.data.price, available: e.data.available, version: e.version } : n)) }
        : old,
    )

    // Carrinho: o servidor recalcula totais e avisos; buscamos de novo se o item estiver nele.
    const owner = this.userId ?? 'guest'
    const cart = this.queryClient.getQueryData<{ items: Array<{ nftId: string }> }>(qk.cart(owner))
    if (cart?.items.some((i) => i.nftId === nftId)) {
      void this.queryClient.invalidateQueries({ queryKey: qk.cart(owner) })
    }
  }

  private onOrderUpdated = (raw: unknown) => {
    const parsed = OrderUpdatedEvent.safeParse(raw)
    if (!parsed.success) return
    const e = parsed.data
    // Evento de outro usuário (ex.: sessão anterior) nunca toca o cache atual.
    if (!this.userId || e.userId !== this.userId) return
    const key = qk.order(this.userId, e.resource.id)
    const cached = this.queryClient.getQueryData<Order>(key)
    if (cached) this.noteVersion(`order:${e.resource.id}`, cached.version)
    if (!this.accept(e.eventId, `order:${e.resource.id}`, e.version)) return

    this.queryClient.setQueryData<Order>(key, (old) => {
      if (!old) return old
      if (old.status !== 'pending') return old // terminal não regride
      return { ...old, ...e.data, version: e.version, explorerUrl: e.data.txHash ? `https://sepolia.etherscan.io/tx/${e.data.txHash}` : null }
    })
    // Busca o recibo completo e atualiza o carrinho (itens comprados saem dele).
    void this.queryClient.invalidateQueries({ queryKey: key })
    void this.queryClient.invalidateQueries({ queryKey: qk.cart(this.userId) })
    void this.queryClient.invalidateQueries({ queryKey: qk.nfts })
  }
}
