/**
 * Controles da simulação: usados pelo Painel de cenários e pelos testes Playwright.
 * Tudo aqui altera o "servidor" (db + socket); a interface só vê o efeito via REST e Socket.IO.
 * Escritas passam por `db.withDb` (mesma transação dos handlers): valem para todas as abas abertas.
 * Leituras releem o estado salvo antes (outra aba pode ter gravado).
 */
import * as db from './db'
import { connectionCount, dropAllConnections } from './realtime'
import { getScenario, PRESETS, resetScenario, setScenario, type Scenario } from './scenario'

function fresh() {
  db.refreshFromStorage()
  return db.getState()
}

export const mockControls = {
  getScenario,
  setScenario: (patch: Partial<Scenario>) => setScenario(patch),
  applyPreset: (name: keyof typeof PRESETS) => setScenario({ ...PRESETS[name] }),
  /** Restaura dados e cenário para o estado conhecido (seed). As outras abas recarregam e reconectam. */
  async reset() {
    resetScenario()
    await db.withDb(() => db.resetDb())
    dropAllConnections()
  },
  expireSessions: () => db.withDb(() => db.expireAllSessions()),
  /**
   * Caixa de saída do "servidor de e-mail" simulado (não há envio real nesta demonstração).
   * `lastEmail('ana@kurio.test')` devolve o último e-mail para esse endereço, com o link de ação.
   */
  lastEmail: (to?: string) => (fresh(), db.lastEmail(to)),
  outbox: () => [...(fresh().outbox ?? [])],
  expirePasswordResets: () => db.withDb(() => db.expirePasswordResets()),
  changePrice: (nftId: string, editionId: string, price: string) => db.withDb(() => Boolean(db.updateEdition(nftId, editionId, { price }))),
  setAvailability: (nftId: string, editionId: string, available: number) => db.withDb(() => Boolean(db.updateEdition(nftId, editionId, { available }))),
  reemitLastEvent: () => db.withDb(() => Boolean(db.reemitLastEvent())),
  emitStaleNftEvent: (nftId: string) => db.withDb(() => Boolean(db.emitStaleNftEvent(nftId))),
  dropConnections: () => dropAllConnections(),
  setRealtimeOffline(offline: boolean) {
    setScenario({ realtimeOffline: offline })
    if (offline) dropAllConnections()
  },
  connectionCount,
  settleNow: () =>
    db.withDb(() => {
      db.getState().orders.forEach((o) => {
        if (o.status === 'pending') o.settleAt = 0
      })
      db.settleDueOrders()
    }),
  getOrders: () => fresh().orders.map(db.publicOrder),
  getNft: (id: string) => (fresh(), db.findNft(id)),
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
