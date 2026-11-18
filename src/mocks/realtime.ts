/**
 * Servidor Socket.IO simulado com MSW + @mswjs/socket.io-binding.
 *
 * O app usa o `socket.io-client` de verdade. O MSW intercepta o WebSocket que ele abre e
 * o binding traduz o protocolo Socket.IO (pacotes "0", "40", "42[...]") para eventos.
 *
 * Limitações do transporte simulado (documentadas no ARCHITECTURE.md):
 *  - só o transporte `websocket` é interceptado (o long-polling é HTTP e não passa por aqui),
 *    por isso o cliente é criado com `transports: ['websocket']`;
 *  - o binding responde ao handshake sozinho e não envia "ping" do Engine.IO; sem ping o cliente
 *    derruba a conexão após pingInterval + pingTimeout. Aqui enviamos o ping ("2") manualmente;
 *  - sem rooms/namespaces: a entrega por usuário é feita filtrando as conexões pelo token.
 */
import { toSocketIo } from '@mswjs/socket.io-binding'
import { ws } from 'msw'
import { ADMIN_SOCKET_EVENTS } from '@/api/admin-contracts'
import { SOCKET_EVENTS } from '@/api/contracts'
import { initDb, lookupSession, onDbEvent, onRemoteReset, refreshFromStorage } from './db'
import { getScenario } from './scenario'

export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? 'wss://realtime.jungle.mock'

interface LiveConnection {
  id: number
  userId: string | null
  /** Conta admin: recebe também o feed do painel (admin.activity). */
  isAdmin: boolean
  emit: (event: string, payload: unknown) => void
  close: () => void
}

const connections = new Set<LiveConnection>()
let connSeq = 0

/** Derruba todas as conexões ativas (o cliente reconecta sozinho). */
export function dropAllConnections() {
  connections.forEach((c) => c.close())
}

export function connectionCount() {
  return connections.size
}

// Outra aba restaurou a seed: as conexões desta aba caem e o cliente reconecta e reconcilia pela REST.
onRemoteReset(() => dropAllConnections())

// Encaminha cada evento do "banco" para os sockets certos: os gerados nesta aba e os que chegam de outra aba
// (mesmo eventId e versão; o cliente deduplica). Pedido continua indo só para as conexões do dono; o feed do
// painel (admin.activity) só para conexões de contas admin (papel lido da sessão no servidor, ao conectar).
onDbEvent((event) => {
  connections.forEach((c) => {
    if (event.type === 'admin.activity') {
      if (c.isAdmin) c.emit(ADMIN_SOCKET_EVENTS.activity, event)
      return
    }
    if (event.type === 'order.updated') {
      // Evento de pedido só vai para o dono (isolamento entre usuários).
      if (c.userId === event.userId) c.emit(SOCKET_EVENTS.orderUpdated, event)
      return
    }
    c.emit(SOCKET_EVENTS.nftUpdated, event)
  })
})

const realtime = ws.link(`${SOCKET_URL}/*`)

export const realtimeHandlers = [
  realtime.addEventListener('connection', (connection) => {
    const { client } = connection
    if (getScenario().realtimeOffline) {
      // Servidor fora do ar: fecha na hora, o socket.io-client tenta de novo com backoff.
      queueMicrotask(() => client.close(1011, 'offline'))
      return
    }

    const io = toSocketIo(connection)
    const live: LiveConnection = {
      id: ++connSeq,
      userId: null,
      isAdmin: false,
      emit: (event, payload) => io.client.emit(event, payload),
      close: () => client.close(1001, 'server closed'),
    }
    connections.add(live)

    // Pacote CONNECT do Socket.IO ("40{...auth}"): identifica o usuário pelo token da sessão.
    client.addEventListener('message', async (event) => {
      if (typeof event.data !== 'string' || !event.data.startsWith('40')) return
      await initDb()
      // A sessão pode ter sido criada em outra aba (login lá, token compartilhado pelo localStorage).
      refreshFromStorage()
      try {
        const auth = JSON.parse(event.data.slice(2) || '{}') as { token?: string }
        const s = lookupSession(auth.token ?? null)
        live.userId = s.status === 'ok' ? s.user.id : null
        live.isAdmin = s.status === 'ok' && s.user.role === 'admin'
      } catch {
        live.userId = null
        live.isAdmin = false
      }
    })

    // Heartbeat do Engine.IO (ver limitações acima).
    const ping = setInterval(() => client.send('2'), 20_000)

    client.addEventListener('close', () => {
      clearInterval(ping)
      connections.delete(live)
    })
  }),
]
