import { describe, expect, it, vi } from 'vitest'
import { createEscapeDetector, createWorkerWatchdog, MIN_RESTART_INTERVAL_MS } from './worker-watchdog'

describe('vigia do service worker', () => {
  it('worker saudável: nunca religa (parar o worker derrubaria pedidos em andamento)', async () => {
    const restart = vi.fn(async () => {})
    const w = createWorkerWatchdog({ isHealthy: async () => true, restart })
    expect(await w.check()).toBe(false)
    expect(restart).not.toHaveBeenCalled()
  })

  it('worker fora do ar: religa', async () => {
    const restart = vi.fn(async () => {})
    const w = createWorkerWatchdog({ isHealthy: async () => false, restart })
    expect(await w.check()).toBe(true)
    expect(restart).toHaveBeenCalledOnce()
    expect(w.restartCount()).toBe(1)
  })

  it('verificações simultâneas compartilham uma só (uma religada para uma rajada de pedidos que escaparam)', async () => {
    let healthy = false
    const isHealthy = vi.fn(async () => healthy)
    const restart = vi.fn(async () => {
      healthy = true
    })
    const w = createWorkerWatchdog({ isHealthy, restart })
    const results = await Promise.all([w.check(), w.check(), w.check()])
    expect(results).toEqual([true, true, true])
    expect(isHealthy).toHaveBeenCalledOnce()
    expect(restart).toHaveBeenCalledOnce()
  })

  it('não entra em laço: no máximo uma religada a cada 2 s, e erro ao religar não escapa', async () => {
    let t = 0
    const restart = vi.fn(async () => {
      throw new Error('não subiu')
    })
    const w = createWorkerWatchdog({ isHealthy: async () => false, restart, now: () => t })
    expect(await w.check()).toBe(true)
    expect(await w.check()).toBe(false)
    t += MIN_RESTART_INTERVAL_MS
    expect(await w.check()).toBe(true)
    expect(restart).toHaveBeenCalledTimes(2)
  })
})

describe('detector de pedido que escapou do MSW', () => {
  const api = (url: string) => url.startsWith('http://app/api/') && !url.includes('__health')

  it('pedido visto pelo MSW não conta; pedido que terminou sem ter sido visto escapou', () => {
    const d = createEscapeDetector(api)
    d.handled('http://app/api/nfts?page=3')
    expect(d.finished('http://app/api/nfts?page=3')).toBe(false)
    expect(d.finished('http://app/api/nfts?page=3')).toBe(true)
  })

  it('pedidos repetidos para a mesma URL são contados', () => {
    const d = createEscapeDetector(api)
    d.handled('http://app/api/cart')
    d.handled('http://app/api/cart')
    expect(d.finished('http://app/api/cart')).toBe(false)
    expect(d.finished('http://app/api/cart')).toBe(false)
    expect(d.finished('http://app/api/cart')).toBe(true)
  })

  it('ignora o que não é da API (arquivos estáticos) e a própria verificação de saúde', () => {
    const d = createEscapeDetector(api)
    expect(d.finished('http://app/assets/index.js')).toBe(false)
    expect(d.finished('http://app/api/__health')).toBe(false)
  })
})
