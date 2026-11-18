/**
 * Liga a camada de mocks no navegador (dev, demonstração publicada e testes Playwright).
 * Ativada por VITE_ENABLE_MOCKS=true; o app em si não sabe que está falando com um mock.
 */
import { http, passthrough } from 'msw'
import { setupWorker } from 'msw/browser'
import { setNetworkRecovery } from '@/api/http'
import { exposeMockControls } from './controls'
import { initDb, settleDueOrdersShared, startDbSync } from './db'
import { handlers } from './handlers'
import { realtimeHandlers } from './realtime'
import { applyScenarioFromUrl } from './scenario'

/**
 * Arquivos estáticos do próprio site (chunks JS, CSS, fontes e artes) seguem para a rede logo no primeiro
 * handler. O service worker do MSW manda toda requisição da página para a aba decidir, e o MSW testa os
 * handlers em ordem, montando o padrão de rota de cada um a cada requisição. Sem este atalho, cada chunk e
 * cada imagem baixados na carga passariam pelos ~45 handlers da API antes de seguir, na thread principal.
 */
function staticFilesPassthrough() {
  const origin = window.location.origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return http.get(new RegExp(`^${origin}/(?:assets|nfts|fonts)/`), () => passthrough())
}

export async function startMocks() {
  applyScenarioFromUrl(window.location.search)
  await initDb()
  // Mudanças feitas em outra aba (admin, compra, cenários) chegam aqui e saem pelo socket desta aba.
  startDbSync()
  const worker = setupWorker(staticFilesPassthrough(), ...handlers, ...realtimeHandlers)
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
  // Pagamentos pendentes avançam mesmo após refresh (o "servidor" confere o relógio). Com várias abas, cada
  // uma confere, mas a liquidação roda sob a trava entre abas e é idempotente: só a primeira liquida.
  void settleDueOrdersShared()
  setInterval(() => void settleDueOrdersShared(), 500)
  exposeMockControls()
}
