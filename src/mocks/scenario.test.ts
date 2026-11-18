/**
 * Cenários da simulação: cada preset parte do cenário base inteiro (nada do cenário anterior sobrevive),
 * o reset restaura o base e a URL (?mock=) também começa do base.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryStorage } from '@/test/memory-storage'
import { mockControls } from './controls'
import { applyPreset, applyScenarioFromUrl, DEFAULT_SCENARIO, getScenario, nextLatency, PRESETS, presetScenario, resetScenario, setScenario, takeFault, type Scenario } from './scenario'

/** Cenário "sujo": um pouco de tudo fora do padrão. */
const DIRTY: Partial<Scenario> = {
  latency: 'slow',
  outOfOrder: true,
  payment: 'reject',
  paymentDelayMs: 99_000,
  orderTimeoutOnce: true,
  walletRejectOnce: true,
  sessionTtlSec: 5,
  realtimeOffline: true,
  faults: [
    { route: 'GET /api/nfts', kind: 'http500', times: -1 },
    { route: 'POST /api/orders', kind: 'timeout', times: 3 },
  ],
  seed: 7,
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createMemoryStorage())
  resetScenario()
})

describe('presets', () => {
  it('"padrao" depois de um cenário sujo volta ao base inteiro', () => {
    setScenario(DIRTY)
    applyPreset('padrao')
    expect(getScenario()).toEqual(DEFAULT_SCENARIO)
    expect(takeFault('GET', '/api/nfts')).toBeNull()
  })

  it.each(Object.keys(PRESETS))('"%s" = base + só o que o preset define, venha de onde vier', (name) => {
    setScenario(DIRTY)
    applyPreset(name)
    expect(getScenario()).toEqual({ ...DEFAULT_SCENARIO, ...PRESETS[name] })
  })

  it('preset de falha não herda o pagamento recusado do cenário anterior (e vice-versa)', () => {
    applyPreset('pagamento-recusado')
    applyPreset('catalogo-500')
    expect(getScenario().payment).toBe('approve')
    expect(getScenario().faults).toEqual([{ route: 'GET /api/nfts', kind: 'http500', times: -1 }])
    applyPreset('pagamento-recusado')
    expect(getScenario().faults).toEqual([])
  })

  it('consumir uma falha não altera o preset nem o base (cópias, sem arrays compartilhados)', () => {
    setScenario({ faults: [{ route: 'GET /api/nfts', kind: 'http500', times: 1 }] })
    expect(takeFault('GET', '/api/nfts')).toBe('http500')
    applyPreset('catalogo-500')
    getScenario().faults.push({ route: '*', kind: 'network', times: -1 })
    expect(PRESETS['catalogo-500'].faults).toHaveLength(1)
    expect(DEFAULT_SCENARIO.faults).toEqual([])
    expect(presetScenario('padrao').faults).toEqual([])
  })

  it('preset desconhecido é erro (não aplica nada pela metade)', () => {
    setScenario({ payment: 'reject' })
    expect(() => applyPreset('nao-existe')).toThrow(/desconhecido/)
    expect(() => applyPreset('__proto__')).toThrow(/desconhecido/)
    expect(getScenario().payment).toBe('reject')
  })

  it('gerador de latência recomeça da semente: mesmo preset = mesma sequência', () => {
    applyPreset('latencia-variavel')
    const a = [nextLatency(), nextLatency(), nextLatency()]
    setScenario(DIRTY)
    applyPreset('latencia-variavel')
    expect([nextLatency(), nextLatency(), nextLatency()]).toEqual(a)
  })
})

describe('reset', () => {
  it('restaura o base inteiro e persiste', () => {
    setScenario(DIRTY)
    resetScenario()
    expect(getScenario()).toEqual(DEFAULT_SCENARIO)
    expect(JSON.parse(localStorage.getItem('jungle.mock.scenario.v1')!)).toEqual(DEFAULT_SCENARIO)
  })
})

describe('URL (?mock=)', () => {
  it('?mock=padrao zera o cenário salvo', () => {
    setScenario(DIRTY)
    applyScenarioFromUrl('?mock=padrao')
    expect(getScenario()).toEqual(DEFAULT_SCENARIO)
  })

  it('combina presets e pares chave:valor a partir do base; valores inválidos são ignorados', () => {
    setScenario(DIRTY)
    applyScenarioFromUrl('?mock=catalogo-500,payment:reject,latency:turbo,seed:abc')
    expect(getScenario()).toEqual({ ...DEFAULT_SCENARIO, faults: PRESETS['catalogo-500'].faults, payment: 'reject' })
  })

  it('sem ?mock= não mexe no cenário salvo', () => {
    setScenario({ payment: 'reject' })
    applyScenarioFromUrl('?q=ape')
    expect(getScenario().payment).toBe('reject')
  })
})

describe('controles (__jungleMock)', () => {
  it('applyPreset("padrao") pelo controle também zera tudo', () => {
    mockControls.setScenario(DIRTY)
    mockControls.applyPreset('padrao')
    expect(mockControls.getScenario()).toEqual(DEFAULT_SCENARIO)
  })
})
