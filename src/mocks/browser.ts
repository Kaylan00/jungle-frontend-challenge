/**
 * Liga a camada de mocks no navegador (dev, demonstração publicada e testes Playwright).
 * Ativada por VITE_ENABLE_MOCKS=true; o app em si não sabe que está falando com um mock.
 */
import { setupWorker } from 'msw/browser'
import { setNetworkRecovery } from '@/api/http'
import { exposeMockControls } from './controls'
import { initDb, settleDueOrders } from './db'
import { handlers } from './handlers'
import { realtimeHandlers } from './realtime'
import { applyScenarioFromUrl } from './scenario'

export async function startMocks() {
  applyScenarioFromUrl(window.location.search)
  await initDb()
  const worker = setupWorker(...handlers, ...realtimeHandlers)
  const options = {
    onUnhandledRequest: 'bypass' as const,
    quiet: import.meta.env.PROD,
    serviceWorker: { url: '/mockServiceWorker.js' },
  }
  await worker.start(options)
  // O navegador pode encerrar ou trocar o service worker (aba parada muito tempo, nova publicação):
  // aí um pedido escapa para o host e volta HTML. O cliente HTTP chama isto para religar o worker.
  let restarting: Promise<void> | null = null
  setNetworkRecovery(() => {
    restarting ??= (async () => {
      try {
        worker.stop()
        await worker.start(options)
      } finally {
        restarting = null
      }
    })()
    return restarting
  })
  // Pagamentos pendentes avançam mesmo após refresh (o "servidor" confere o relógio).
  settleDueOrders()
  setInterval(settleDueOrders, 500)
  exposeMockControls()
}
