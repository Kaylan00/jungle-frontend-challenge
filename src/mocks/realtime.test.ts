/**
 * Servidor Socket.IO simulado (MSW em Node) com o socket.io-client de verdade.
 *
 * Regressão da "reconexão lenta": com o socket fora do ar, o mock fechava o WebSocket antes do handshake do
 * Engine.IO sem disparar `error`; o Manager do socket.io-client ignora `close` nessa fase e só desistia da
 * tentativa no `timeout` (20 s). Agora a recusa é como a de um servidor fora do ar de verdade (`error` e
 * `close`, sem `open`): connect_error imediato e a reconexão sai no próximo passo do backoff.
 */
import { setupServer } from 'msw/node'
import type { Socket } from 'socket.io-client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryStorage } from '@/test/memory-storage'
import * as db from './db'
import { connectionCount, dropAllConnections, realtimeHandlers, SOCKET_URL } from './realtime'
import { resetScenario, setScenario } from './scenario'

const server = setupServer(...realtimeHandlers)
const ENGINE_URL = `${SOCKET_URL}/socket.io/?EIO=4&transport=websocket`

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())

beforeEach(async () => {
  vi.stubGlobal('localStorage', createMemoryStorage())
  resetScenario()
  await db.resetDb()
})

let sockets: Socket[] = []
afterEach(() => {
  sockets.forEach((s) => s.disconnect())
  sockets = []
  dropAllConnections()
})

/**
 * socket.io-client com o transporte WebSocket "de navegador" (usa o WebSocket global, que o MSW intercepta).
 * Importado depois do server.listen(): o engine.io-client guarda o construtor do WebSocket ao carregar.
 */
async function connectClient(opts: { reconnectionDelay?: number; reconnectionDelayMax?: number } = {}) {
  const { io } = await import('socket.io-client')
  const { WebSocket: BrowserWebSocketTransport } = await import('engine.io-client')
  const socket = io(SOCKET_URL, {
    transports: [BrowserWebSocketTransport],
    reconnectionDelay: opts.reconnectionDelay ?? 50,
    reconnectionDelayMax: opts.reconnectionDelayMax ?? 100,
    randomizationFactor: 0,
    auth: { token: null },
  })
  sockets.push(socket)
  return socket
}

function once<T = unknown>(socket: Socket, event: string) {
  return new Promise<T>((resolve) => socket.once(event as 'connect', ((arg: T) => resolve(arg)) as never))
}

describe('servidor fora do ar recusa a conexão como um servidor real', () => {
  it('WebSocket cru: error e close (1006) na hora, nunca open', async () => {
    setScenario({ realtimeOffline: true })
    const events: string[] = []
    const t0 = performance.now()
    const ws = new WebSocket(ENGINE_URL)
    ws.addEventListener('open', () => events.push('open'))
    ws.addEventListener('error', () => events.push('error'))
    const closed = new Promise<CloseEvent>((resolve) => ws.addEventListener('close', (e) => resolve(e)))
    const close = await closed
    events.push('close')
    expect(events).toEqual(['error', 'close'])
    expect(close.code).toBe(1006)
    expect(performance.now() - t0).toBeLessThan(200)
    expect(connectionCount()).toBe(0)
  })

  it('no ar: abre e o servidor manda o handshake do Engine.IO ("0{sid,...}")', async () => {
    const ws = new WebSocket(ENGINE_URL)
    const first = await new Promise<string>((resolve) => ws.addEventListener('message', (e) => resolve(String(e.data))))
    expect(first.startsWith('0{')).toBe(true)
    expect(JSON.parse(first.slice(1))).toMatchObject({ sid: expect.any(String) })
    ws.close()
  })
})

describe('socket.io-client de verdade', () => {
  it('fora do ar: connect_error imediato (não espera o timeout de 20 s) e segue tentando pelo backoff', async () => {
    setScenario({ realtimeOffline: true })
    const t0 = performance.now()
    const socket = await connectClient()
    const err = await once<Error>(socket, 'connect_error')
    expect(err).toBeInstanceOf(Error)
    expect(performance.now() - t0).toBeLessThan(500)
    // Segunda recusa também chega logo (a tentativa não fica pendurada).
    await once(socket, 'connect_error')
    expect(performance.now() - t0).toBeLessThan(1_000)
    expect(socket.active).toBe(true)
  })

  it('religar o servidor: conecta na próxima tentativa do backoff', async () => {
    setScenario({ realtimeOffline: true })
    const socket = await connectClient()
    await once(socket, 'connect_error')
    await once(socket, 'connect_error')
    setScenario({ realtimeOffline: false })
    const t0 = performance.now()
    await once(socket, 'connect')
    // reconnectionDelayMax de 100 ms neste teste: conecta no próximo passo, não 20 s depois.
    expect(performance.now() - t0).toBeLessThan(1_000)
    expect(socket.connected).toBe(true)
    expect(connectionCount()).toBe(1)
  })

  it('servidor derrubado no meio da sessão: reconecta sozinho', async () => {
    const socket = await connectClient()
    await once(socket, 'connect')
    dropAllConnections()
    await once(socket, 'disconnect')
    const t0 = performance.now()
    await once(socket, 'connect')
    expect(performance.now() - t0).toBeLessThan(1_000)
  })
})
