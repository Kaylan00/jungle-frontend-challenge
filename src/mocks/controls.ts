/**
 * Controles da simulação: usados pelo Painel de cenários e pelos testes Playwright.
 * Tudo aqui altera o "servidor" (db + socket); a interface só vê o efeito via REST e Socket.IO.
 */
import * as db from './db'
import { connectionCount, dropAllConnections } from './realtime'
import { getScenario, PRESETS, resetScenario, setScenario, type Scenario } from './scenario'

export const mockControls = {
  getScenario,
  setScenario: (patch: Partial<Scenario>) => setScenario(patch),
  applyPreset: (name: keyof typeof PRESETS) => setScenario({ ...PRESETS[name] }),
  /** Restaura dados e cenário para o estado conhecido (seed). */
  async reset() {
    resetScenario()
    await db.resetDb()
    dropAllConnections()
  },
  expireSessions: () => db.expireAllSessions(),
  changePrice(nftId: string, editionId: string, price: string) {
    return Boolean(db.updateEdition(nftId, editionId, { price }))
  },
  setAvailability(nftId: string, editionId: string, available: number) {
    return Boolean(db.updateEdition(nftId, editionId, { available }))
  },
  reemitLastEvent: () => Boolean(db.reemitLastEvent()),
  emitStaleNftEvent: (nftId: string) => Boolean(db.emitStaleNftEvent(nftId)),
  dropConnections: () => dropAllConnections(),
  setRealtimeOffline(offline: boolean) {
    setScenario({ realtimeOffline: offline })
    if (offline) dropAllConnections()
  },
  connectionCount,
  settleNow() {
    db.getState().orders.forEach((o) => {
      if (o.status === 'pending') o.settleAt = 0
    })
    db.settleDueOrders()
  },
  getOrders: () => db.getState().orders.map(db.publicOrder),
  getNft: (id: string) => db.findNft(id),
}

export type MockControls = typeof mockControls

declare global {
  interface Window {
    __jungleMock?: MockControls
  }
}

export function exposeMockControls() {
  window.__jungleMock = mockControls
}
