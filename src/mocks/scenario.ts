/**
 * Cenários de rede e de negócio da simulação.
 *
 * Fonte única de configuração dos mocks. Pode ser alterada por:
 *  - URL: `?mock=slow` ou `?mock=latency:variable,payment:reject` (aplicado na carga da página);
 *  - Painel de cenários (botão flutuante no build de demonstração);
 *  - Playwright: `window.__jungleMock.setScenario({...})`.
 * Fica salva no localStorage para sobreviver ao refresh. `reset()` volta ao padrão.
 */

export type Latency = 'off' | 'normal' | 'slow' | 'variable'
export type FaultKind = 'http500' | 'http503' | 'network' | 'timeout'

export interface Fault {
  /** Ex.: 'GET /api/nfts', 'POST /api/favorites/*', '*' */
  route: string
  kind: FaultKind
  /** Quantas vezes ainda vai falhar (-1 = sempre) */
  times: number
}

export interface Scenario {
  latency: Latency
  /** Respostas da listagem chegam fora de ordem (a requisição mais antiga demora mais). */
  outOfOrder: boolean
  /** Resultado do pagamento simulado */
  payment: 'approve' | 'reject'
  /** Tempo até o pagamento ser processado (ms) */
  paymentDelayMs: number
  /** Próxima criação de pedido grava o pedido mas a resposta "se perde" (timeout no cliente). */
  orderTimeoutOnce: boolean
  /** Próxima conexão de carteira é recusada pelo usuário na "extensão". */
  walletRejectOnce: boolean
  /** Duração da sessão (segundos) */
  sessionTtlSec: number
  /** Socket.IO fora do ar: conexões são derrubadas na hora */
  realtimeOffline: boolean
  faults: Fault[]
  /** Semente do gerador pseudoaleatório (latência variável reproduzível) */
  seed: number
}

export const DEFAULT_SCENARIO: Scenario = {
  latency: 'normal',
  outOfOrder: false,
  payment: 'approve',
  paymentDelayMs: 2500,
  orderTimeoutOnce: false,
  walletRejectOnce: false,
  sessionTtlSec: 60 * 60 * 8,
  realtimeOffline: false,
  faults: [],
  seed: 42,
}

/** Cópia nova do cenário base (os arrays nunca são compartilhados com DEFAULT_SCENARIO nem com os presets). */
export function baseScenario(): Scenario {
  return structuredClone(DEFAULT_SCENARIO)
}

/**
 * Presets nomeados, usados no painel, no README e na URL (?mock=nome). Cada preset descreve só o que muda em
 * relação ao cenário BASE: aplicar um preset parte sempre do base (ver `presetScenario`), nunca do cenário
 * atual. Assim `padrao` zera tudo e "catálogo 500" não herda o pagamento recusado de antes.
 */
export const PRESETS: Record<string, Partial<Scenario>> = {
  padrao: {},
  rapido: { latency: 'off' },
  lento: { latency: 'slow' },
  'latencia-variavel': { latency: 'variable' },
  'fora-de-ordem': { latency: 'variable', outOfOrder: true },
  'catalogo-500': { faults: [{ route: 'GET /api/nfts', kind: 'http500', times: -1 }] },
  'sem-conexao': { faults: [{ route: '*', kind: 'network', times: -1 }] },
  'pagamento-recusado': { payment: 'reject' },
  'timeout-pedido': { orderTimeoutOnce: true },
  'carteira-recusa': { walletRejectOnce: true },
  'sessao-curta': { sessionTtlSec: 60 },
  'tempo-real-offline': { realtimeOffline: true },
}

const STORAGE_KEY = 'jungle.mock.scenario.v1'

let current: Scenario = load()

function load(): Scenario {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...baseScenario(), ...JSON.parse(raw) }
  } catch {
    /* sem storage: usa o padrão */
  }
  return baseScenario()
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l(current))
}

const listeners = new Set<(s: Scenario) => void>()
export function subscribeScenario(fn: (s: Scenario) => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getScenario(): Scenario {
  return current
}

export function setScenario(patch: Partial<Scenario>) {
  current = { ...current, ...patch }
  rng = mulberry32(current.seed)
  save()
}

export function resetScenario() {
  replaceScenario(baseScenario())
}

function replaceScenario(next: Scenario) {
  current = next
  rng = mulberry32(current.seed)
  save()
}

export function isPreset(name: string): boolean {
  return Object.hasOwn(PRESETS, name)
}

/** Cenário completo de um preset: o base inteiro com só o que o preset define por cima. */
export function presetScenario(name: string): Scenario {
  if (!isPreset(name)) throw new Error(`Preset de cenário desconhecido: ${name}`)
  return { ...baseScenario(), ...structuredClone(PRESETS[name]) }
}

/** Troca o cenário inteiro pelo do preset (nada do cenário anterior sobrevive). */
export function applyPreset(name: string) {
  replaceScenario(presetScenario(name))
}

/**
 * Lê `?mock=` da URL: aceita presets e pares chave:valor separados por vírgula, sempre a partir do cenário
 * base (o que estava salvo antes não vale). Tokens desconhecidos são ignorados.
 */
export function applyScenarioFromUrl(search: string) {
  const value = new URLSearchParams(search).get('mock')
  if (!value) return
  let next = baseScenario()
  for (const token of value.split(',')) {
    if (isPreset(token)) {
      next = { ...next, ...structuredClone(PRESETS[token]) }
      continue
    }
    const [k, v] = token.split(':')
    if (k === 'latency' && (['off', 'normal', 'slow', 'variable'] as const).includes(v as Latency)) next.latency = v as Latency
    if (k === 'payment' && (v === 'approve' || v === 'reject')) next.payment = v
    if (k === 'seed' && Number.isFinite(Number(v))) next.seed = Number(v)
    if (k === 'outOfOrder') next.outOfOrder = v !== 'false'
  }
  replaceScenario(next)
}

// ---------- Latência determinística ----------

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

let rng = mulberry32(current.seed)

export function nextLatency(): number {
  switch (current.latency) {
    case 'off':
      return 0
    case 'slow':
      return 2500
    case 'variable':
      return Math.round(100 + rng() * 1400)
    default:
      return Math.round(150 + rng() * 250)
  }
}

// ---------- Falhas ----------

function matches(pattern: string, method: string, pathname: string) {
  if (pattern === '*') return true
  const [m, p] = pattern.split(' ')
  if (m !== method) return false
  if (p.endsWith('/*')) return pathname.startsWith(p.slice(0, -1))
  return pathname === p
}

/** Consome e devolve a falha configurada para a requisição, se houver. */
export function takeFault(method: string, pathname: string): FaultKind | null {
  const idx = current.faults.findIndex((f) => f.times !== 0 && matches(f.route, method, pathname))
  if (idx === -1) return null
  const fault = current.faults[idx]
  if (fault.times > 0) {
    const faults = [...current.faults]
    faults[idx] = { ...fault, times: fault.times - 1 }
    current = { ...current, faults: faults.filter((f) => f.times !== 0) }
    save()
  }
  return fault.kind
}

export function consumeFlag(flag: 'orderTimeoutOnce' | 'walletRejectOnce'): boolean {
  if (!current[flag]) return false
  current = { ...current, [flag]: false }
  save()
  return true
}
