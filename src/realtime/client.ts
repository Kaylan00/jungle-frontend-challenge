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
import { NftUpdatedEvent, OrderUpdatedEvent, SOCKET_EVENTS, type AdminNftListResponse, type NftDetail, type NftListResponse, type Order } from '@/api/contracts'
import { ADMIN_SOCKET_EVENTS, AdminActivityEvent, type AdminActivityList } from '@/api/admin-contracts'
import { ADMIN_ACTIVITY_LIMIT, favoritesQuery, nftDetailQuery, qk } from '@/api/queries'
import { sessionStore } from '@/api/session-store'
import { notePriceChange, recordPriceDrop } from '@/features/favorites/price-drops'
import { announce } from '@/lib/announcer'
import { compareEth, formatEth } from '@/lib/eth'
import { explorerUrl } from '@/lib/explorer'

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
      // Prazo de cada tentativa (handshake do Engine.IO + CONNECT do Socket.IO). O padrão é 20 s: um servidor
      // que aceita o WebSocket mas fecha (ou some) antes do handshake prenderia o cliente esse tempo todo em
      // "reconectando", porque o Manager não trata `close` antes do `open` como falha. Ver ARCHITECTURE.md.
      timeout: 5_000,
      // Função: o token é lido a cada (re)conexão, nunca fica congelado.
      auth: (cb) => cb({ token: sessionStore.getToken() }),
    })

    this.socket.on('connect', this.onConnect)
    this.socket.on('disconnect', this.onDisconnect)
    this.socket.io.on('reconnect_attempt', () => this.setStatus('reconnecting'))
    this.socket.io.on('reconnect_failed', () => this.setStatus('offline'))
    this.socket.on(SOCKET_EVENTS.nftUpdated, this.onNftUpdated)
    this.socket.on(SOCKET_EVENTS.orderUpdated, this.onOrderUpdated)
    this.socket.on(ADMIN_SOCKET_EVENTS.activity, this.onAdminActivity)

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

    // O que a tela mostrava antes (preço e nome), para o alerta de queda nos favoritos.
    const known = this.knownSummary(nftId)
    const featured = e.data.featured
    const summaryPatch = { price: e.data.price, available: e.data.available, version: e.version, ...(featured === undefined ? {} : { featured }) }
    const applyEditions = <T extends NftDetail>(old: T): T => ({
      ...old,
      ...summaryPatch,
      editions: old.editions.map((ed) => {
        const upd = e.data.editions.find((x) => x.id === ed.id)
        return upd ? { ...ed, ...upd } : ed
      }),
    })

    // Detalhe: aplica direto no cache (sem nova requisição).
    this.queryClient.setQueryData<NftDetail>(qk.nftDetail(nftId), (old) => (!old || old.version >= e.version ? old : applyEditions(old)))

    // Listagens: atualiza o card onde ele aparecer.
    this.queryClient.setQueriesData<NftListResponse>({ queryKey: ['nfts', 'list'] }, (old) =>
      old ? { ...old, items: old.items.map((n) => (n.id === nftId && n.version < e.version ? { ...n, ...summaryPatch } : n)) } : old,
    )
    const featuredList = this.queryClient.getQueryData<{ items: NftListResponse['items'] }>(qk.featured)
    if (featuredList && featured !== undefined && featuredList.items.some((n) => n.id === nftId) !== featured) {
      // Entrou ou saiu da vitrine de destaques: a lista (e a ordem) vem da API.
      void this.queryClient.invalidateQueries({ queryKey: qk.featured })
    } else {
      this.queryClient.setQueryData<{ items: NftListResponse['items'] }>(qk.featured, (old) =>
        old ? { items: old.items.map((n) => (n.id === nftId && n.version < e.version ? { ...n, ...summaryPatch } : n)) } : old,
      )
    }

    // Painel admin aberto (nesta ou em outra aba): a lista acompanha ao vivo.
    if (this.userId) {
      this.queryClient.setQueriesData<AdminNftListResponse>({ queryKey: qk.adminNftLists(this.userId) }, (old) =>
        old ? { ...old, items: old.items.map((n) => (n.id === nftId && n.version < e.version ? applyEditions(n) : n)) } : old,
      )
    }

    this.checkFavoritePrice(nftId, e.data.price, e.data.previousPrice ?? known?.price, known?.name)

    // Carrinho: o servidor recalcula totais e avisos; buscamos de novo se o item estiver nele.
    const owner = this.userId ?? 'guest'
    const cart = this.queryClient.getQueryData<{ items: Array<{ nftId: string; name: string }> }>(qk.cart(owner))
    const inCart = cart?.items.find((i) => i.nftId === nftId)
    if (inCart) {
      void this.queryClient.invalidateQueries({ queryKey: qk.cart(owner) })
      announce(`Preço ou disponibilidade de ${inCart.name} mudou. O resumo do carrinho foi atualizado.`)
    } else if (cached && cached.version < e.version && this.isOnScreen(qk.nftDetail(nftId)) && (cached.price !== e.data.price || cached.available !== e.data.available)) {
      // Detalhe aberto (fora do carrinho): o preço muda na tela sem aviso visual extra; o leitor de tela também sabe.
      announce(`${cached.name}: preço ou disponibilidade atualizados agora. ${formatEth(e.data.price)}, ${e.data.available} disponíveis.`)
    }
  }

  /** A consulta tem alguém observando (a tela que a usa está montada). */
  private isOnScreen(queryKey: readonly unknown[]) {
    return (this.queryClient.getQueryCache().find({ queryKey, exact: true })?.getObserversCount() ?? 0) > 0
  }

  /** Nome e preço que o cache conhece (detalhe, listagens ou destaques), antes de aplicar o evento. */
  private knownSummary(nftId: string): { name: string; price: string } | null {
    const detail = this.queryClient.getQueryData<NftDetail>(qk.nftDetail(nftId))
    if (detail) return detail
    for (const [, data] of this.queryClient.getQueriesData<{ items: NftListResponse['items'] }>({ queryKey: qk.nfts })) {
      const hit = data?.items?.find((n) => n.id === nftId)
      if (hit) return hit
    }
    return null
  }

  /**
   * Alerta "Preço caiu" só para o dono dos favoritos: o evento vai para todos, mas só avisa se o NFT está na
   * lista do usuário logado agora (consultada na API se ainda não estiver em cache). Troca de usuário no meio
   * da consulta descarta o alerta.
   */
  private checkFavoritePrice(nftId: string, price: string, previous: string | undefined, knownName: string | undefined) {
    const userId = this.userId
    if (!userId) return
    notePriceChange(userId, nftId, price)
    if (!previous || compareEth(price, previous) >= 0) return
    void (async () => {
      try {
        const favorites = await this.queryClient.ensureQueryData(favoritesQuery(userId))
        if (this.userId !== userId || !favorites.nftIds.includes(nftId)) return
        const name = knownName ?? (await this.queryClient.ensureQueryData(nftDetailQuery(nftId))).name
        if (this.userId !== userId) return
        recordPriceDrop(userId, { nftId, name, from: previous, to: price })
      } catch {
        /* sem favoritos ou sem rede: sem alerta (o preço novo já está na tela) */
      }
    })()
  }

  /**
   * Feed do Kurio Admin (só chega a conexões de contas admin). A linha entra no topo do feed em cache e os
   * números e listas do painel que estiverem na tela são conferidos de novo pela REST (fonte da verdade).
   */
  private onAdminActivity = (raw: unknown) => {
    const parsed = AdminActivityEvent.safeParse(raw)
    if (!parsed.success || !this.userId) return
    const e = parsed.data
    if (this.seen.has(e.eventId)) return
    this.seen.add(e.eventId)
    if (this.seen.size > MAX_SEEN) this.seen.delete(this.seen.values().next().value!)
    const owner = this.userId
    this.queryClient.setQueryData<AdminActivityList>(qk.adminActivity(owner), (old) =>
      old && !old.items.some((a) => a.id === e.activity.id) ? { items: [e.activity, ...old.items].slice(0, ADMIN_ACTIVITY_LIMIT) } : old,
    )
    void this.queryClient.invalidateQueries({ queryKey: qk.adminOverview(owner) })
    if (e.activity.resource.type === 'order') void this.queryClient.invalidateQueries({ queryKey: qk.adminOrderLists(owner) })
    if (e.activity.resource.type === 'coupon') void this.queryClient.invalidateQueries({ queryKey: qk.adminCoupons(owner) })
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
      // Explorador da rede do próprio pedido (Polygon e Solana não ficam no Etherscan).
      return { ...old, ...e.data, version: e.version, explorerUrl: e.data.txHash ? explorerUrl(old.network, e.data.txHash) : null }
    })
    // Busca o recibo completo e atualiza o carrinho (itens comprados saem dele).
    void this.queryClient.invalidateQueries({ queryKey: key })
    void this.queryClient.invalidateQueries({ queryKey: qk.cart(this.userId) })
    void this.queryClient.invalidateQueries({ queryKey: qk.nfts })
  }
}
