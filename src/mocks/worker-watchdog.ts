/**
 * Vigia do service worker do MSW (só na camada de mocks; o app não sabe que ele existe).
 *
 * Problema: o navegador pode encerrar o service worker ocioso (ou trocá-lo numa nova publicação). Quando ele
 * volta, volta "zerado": não sabe mais que esta aba ativou os mocks e deixa os pedidos seguirem para o host,
 * que responde o index.html. Para o app isso é falha de conexão (NETWORK_ERROR, transitória); quem conserta a
 * camada simulada é este vigia, religando o worker (`worker.stop()` + `worker.start()`), e o retry do Query
 * pega a resposta certa na tentativa seguinte.
 *
 * Como descobre que precisa religar:
 *  - pedido que escapou: todo pedido /api/ que termina (Resource Timing) e que o MSW não viu começar
 *    (`request:start`) passou direto pelo worker. Isso dispara a verificação na hora, sem esperar o próximo;
 *  - verificação periódica leve com a aba visível, e ao voltar para a aba, ao reconectar a rede e quando o
 *    controlador do service worker muda;
 *  - a verificação é um GET /api/__health que SÓ o MSW responde (JSON `{ mock: true }`). Qualquer outra coisa
 *    (HTML do host, 404, erro de rede) = worker fora do ar = religa. Nunca religa um worker saudável: parar o
 *    worker derrubaria os pedidos em andamento.
 */

export interface WatchdogDeps {
  /** O worker está atendendo os pedidos desta aba? */
  isHealthy: () => Promise<boolean>
  /** Religa o worker (ex.: worker.stop() + worker.start()). */
  restart: () => Promise<void>
  /** Relógio (testes). */
  now?: () => number
}

/** Intervalo mínimo entre duas religadas seguidas (evita laço se o worker não subir). */
export const MIN_RESTART_INTERVAL_MS = 2_000

export function createWorkerWatchdog({ isHealthy, restart, now = () => Date.now() }: WatchdogDeps) {
  let inFlight: Promise<boolean> | null = null
  let lastRestart = -Infinity
  let restarts = 0

  async function run(): Promise<boolean> {
    if (await isHealthy()) return false
    if (now() - lastRestart < MIN_RESTART_INTERVAL_MS) return false
    lastRestart = now()
    restarts += 1
    try {
      await restart()
    } catch {
      /* não subiu agora: a próxima verificação tenta de novo */
    }
    return true
  }

  return {
    /** Verifica e religa se preciso. Chamadas simultâneas compartilham a mesma verificação. `true` = religou. */
    check(): Promise<boolean> {
      inFlight ??= run().finally(() => {
        inFlight = null
      })
      return inFlight
    },
    restartCount: () => restarts,
  }
}

/**
 * Detector de pedido que escapou do MSW: conta os pedidos /api/ que o MSW viu começar e confere cada pedido
 * terminado. Terminado sem ter sido visto = escapou.
 */
export function createEscapeDetector(isWatched: (url: string) => boolean) {
  const seen = new Map<string, number>()
  return {
    /** O MSW recebeu este pedido do worker. */
    handled(url: string) {
      if (!isWatched(url)) return
      if (seen.size > 500) seen.clear() // pedido abortado nunca termina: não deixa o mapa crescer sem fim
      seen.set(url, (seen.get(url) ?? 0) + 1)
    },
    /** Um pedido terminou. `true` = o MSW não o viu: passou direto pelo worker. */
    finished(url: string): boolean {
      if (!isWatched(url)) return false
      const n = seen.get(url) ?? 0
      if (n === 0) return true
      if (n === 1) seen.delete(url)
      else seen.set(url, n - 1)
      return false
    },
  }
}
