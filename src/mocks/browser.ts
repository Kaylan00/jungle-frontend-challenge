/**
 * Liga a camada de mocks no navegador (dev, demonstração publicada e testes Playwright).
 * Ativada por VITE_ENABLE_MOCKS=true; o app em si não sabe que está falando com um mock.
 */
import { http, HttpResponse, passthrough } from 'msw'
import { setupWorker } from 'msw/browser'
import { exposeMockControls, setWorkerRestartCounter } from './controls'
import { initDb, settleDueOrdersShared, startDbSync } from './db'
import { handlers } from './handlers'
import { REAL_EMAIL_ENDPOINT } from './real-email'
import { realtimeHandlers } from './realtime'
import { applyScenarioFromUrl } from './scenario'
import { createEscapeDetector, createWorkerWatchdog } from './worker-watchdog'

/** Rota que só o MSW responde: se a resposta não for este JSON, o service worker não está atendendo a aba. */
export const HEALTH_PATH = '/api/__health'
const HEALTH_INTERVAL_MS = 20_000

function healthHandler() {
  return http.get(`${window.location.origin}${HEALTH_PATH}`, () => HttpResponse.json({ mock: true }, { headers: { 'cache-control': 'no-store' } }))
}

async function workerIsHealthy() {
  try {
    const res = await fetch(HEALTH_PATH, { cache: 'no-store', headers: { accept: 'application/json' } })
    if (!/\bjson\b/.test(res.headers.get('content-type') ?? '')) return false
    return ((await res.json()) as { mock?: unknown }).mock === true
  } catch {
    return false
  }
}

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

/**
 * Mantém o service worker do MSW atendendo esta aba (ver worker-watchdog.ts): o navegador pode encerrá-lo
 * ocioso ou trocá-lo, e ele volta sem saber que a aba ativou os mocks. Tudo aqui é da camada de mocks: o
 * cliente HTTP só vê uma falha de conexão transitória, que o retry do Query repete.
 */
function watchWorker(worker: ReturnType<typeof setupWorker>, options: Parameters<ReturnType<typeof setupWorker>['start']>[0]) {
  const watchdog = createWorkerWatchdog({
    isHealthy: workerIsHealthy,
    restart: async () => {
      worker.stop()
      await worker.start(options)
    },
  })
  const check = () => void watchdog.check()

  // 1) Pedido da API que terminou sem o MSW ter visto: passou direto pelo worker. Verifica na hora.
  const apiPrefix = `${window.location.origin}/api/`
  const escapes = createEscapeDetector((url) => url.startsWith(apiPrefix) && !url.startsWith(`${window.location.origin}${HEALTH_PATH}`) && !url.startsWith(`${window.location.origin}${REAL_EMAIL_ENDPOINT}`))
  worker.events.on('request:start', ({ request }) => escapes.handled(request.url))
  if (typeof PerformanceObserver !== 'undefined') {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
        if ((entry.initiatorType === 'xmlhttprequest' || entry.initiatorType === 'fetch') && escapes.finished(entry.name)) check()
      }
    }).observe({ type: 'resource' })
  }

  // 2) Verificação leve: periódica com a aba visível, ao voltar para a aba, ao voltar a rede e quando o
  //    controlador do service worker muda (worker novo ou removido).
  setInterval(() => {
    if (document.visibilityState === 'visible') check()
  }, HEALTH_INTERVAL_MS)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check()
  })
  window.addEventListener('online', check)
  navigator.serviceWorker?.addEventListener('controllerchange', check)

  // Para os testes E2E e para quem demonstra: quantas vezes o worker foi religado.
  setWorkerRestartCounter(watchdog.restartCount)
}

export async function startMocks() {
  applyScenarioFromUrl(window.location.search)
  await initDb()
  // Mudanças feitas em outra aba (admin, compra, cenários) chegam aqui e saem pelo socket desta aba.
  startDbSync()
  const worker = setupWorker(staticFilesPassthrough(), healthHandler(), ...handlers, ...realtimeHandlers)
  const options = {
    onUnhandledRequest: 'bypass' as const,
    quiet: import.meta.env.PROD,
    serviceWorker: { url: '/mockServiceWorker.js' },
  }
  await worker.start(options)
  watchWorker(worker, options)
  // Pagamentos pendentes avançam mesmo após refresh (o "servidor" confere o relógio). Com várias abas, cada
  // uma confere, mas a liquidação roda sob a trava entre abas e é idempotente: só a primeira liquida.
  void settleDueOrdersShared()
  setInterval(() => void settleDueOrdersShared(), 500)
  exposeMockControls()
}
