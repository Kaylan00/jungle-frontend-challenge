/**
 * Liga a camada de mocks no navegador (dev, demonstração publicada e testes Playwright).
 * Ativada por VITE_ENABLE_MOCKS=true; o app em si não sabe que está falando com um mock.
 */
import { setupWorker } from 'msw/browser'
import { exposeMockControls } from './controls'
import { initDb, settleDueOrders } from './db'
import { handlers } from './handlers'
import { realtimeHandlers } from './realtime'
import { applyScenarioFromUrl } from './scenario'

export async function startMocks() {
  applyScenarioFromUrl(window.location.search)
  await initDb()
  const worker = setupWorker(...handlers, ...realtimeHandlers)
  await worker.start({
    onUnhandledRequest: 'bypass',
    quiet: import.meta.env.PROD,
    serviceWorker: { url: '/mockServiceWorker.js' },
  })
  // Pagamentos pendentes avançam mesmo após refresh (o "servidor" confere o relógio).
  settleDueOrders()
  setInterval(settleDueOrders, 500)
  exposeMockControls()
}
