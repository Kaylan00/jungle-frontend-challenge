/**
 * Cenário 22 — presets de cenário partem do cenário base inteiro: "padrao" zera tudo (falhas por rota,
 * pagamento recusado, socket fora do ar...), venha pelo controle, pelo painel ou pela URL (?mock=).
 */
import { DEFAULT_SCENARIO, PRESETS } from '../src/mocks/scenario'
import { expect, test } from './fixtures'

const DIRTY = {
  latency: 'off',
  payment: 'reject',
  paymentDelayMs: 99_000,
  orderTimeoutOnce: true,
  walletRejectOnce: true,
  sessionTtlSec: 30,
  faults: [{ route: 'GET /api/nfts', kind: 'http500', times: -1 }],
}

test.describe('Presets de cenário', () => {
  test.beforeEach(({ app }) => {
    test.skip(app.isMobile, 'Regra do servidor simulado: independe do layout')
  })

  test('applyPreset("padrao") depois de um cenário sujo volta ao base inteiro', async ({ app }) => {
    await app.goto('/')
    await app.setScenario(DIRTY)
    await app.mock('applyPreset', 'padrao')
    expect(await app.mock('getScenario')).toEqual(DEFAULT_SCENARIO)
  })

  test('cada preset = base + só o que ele define (nada do anterior sobrevive)', async ({ app }) => {
    await app.goto('/')
    for (const name of Object.keys(PRESETS)) {
      await app.setScenario(DIRTY)
      await app.mock('applyPreset', name)
      expect(await app.mock('getScenario'), name).toEqual({ ...DEFAULT_SCENARIO, ...PRESETS[name] })
    }
  })

  test('painel: "Padrão" limpa falha e pagamento recusado, e o catálogo volta', async ({ app, page }) => {
    await app.goto('/')
    await app.setScenario(DIRTY)
    await page.getByRole('button', { name: 'Abrir painel de cenários da simulação' }).click()
    const panel = page.getByRole('region', { name: 'Painel de cenários da simulação' })
    await expect(panel.getByText('recusa', { exact: true })).toBeVisible()
    await panel.getByLabel('Condição de rede / negócio').selectOption('padrao')
    await expect(panel.getByText('aprova', { exact: true })).toBeVisible()
    expect(await app.mock('getScenario')).toEqual(DEFAULT_SCENARIO)

    // A falha do catálogo não vale mais: a página carrega normalmente.
    await page.reload()
    await expect(page.getByTestId('catalog-grid').getByTestId('nft-card')).toHaveCount(9)
  })

  test('painel: trocar de "Pagamento recusado" para "Catálogo com erro 500" não herda o pagamento', async ({ app, page }) => {
    await app.goto('/')
    await page.getByRole('button', { name: 'Abrir painel de cenários da simulação' }).click()
    const select = page.getByLabel('Condição de rede / negócio')
    await select.selectOption('pagamento-recusado')
    await select.selectOption('catalogo-500')
    expect(await app.mock('getScenario')).toEqual({ ...DEFAULT_SCENARIO, ...PRESETS['catalogo-500'] })
  })

  test('?mock=padrao na URL zera o cenário salvo', async ({ app }) => {
    await app.goto('/')
    await app.setScenario(DIRTY)
    await app.goto('/?mock=padrao')
    expect(await app.mock('getScenario')).toEqual(DEFAULT_SCENARIO)
  })

  test('preset "tempo-real-offline" derruba o socket e "padrao" religa', async ({ app, page }) => {
    await app.goto('/')
    await app.realtimeConnected()
    await app.mock('applyPreset', 'tempo-real-offline')
    await expect(page.getByTestId('realtime-status')).toHaveAttribute('data-status', 'reconnecting')
    await app.mock('applyPreset', 'padrao')
    await expect(page.getByTestId('realtime-status')).toHaveAttribute('data-status', 'connected', { timeout: 6_000 })
  })

  test('preset "eventos-caoticos": cada evento chega duplicado e seguido de uma versão antiga, e a tela só aplica o original', async ({ app, page }) => {
    await app.goto('/nft/nft-01?edicao=nft-01-ed-3')
    await app.realtimeConnected()
    await app.mock('applyPreset', 'eventos-caoticos')
    const price = page.getByTestId('detail-price')
    await expect(price).toHaveText('1.19 ETH')
    // Grava cada texto que o preço assumir: o 999 da versão antiga nunca pode aparecer, nem por um quadro.
    await price.evaluate((el) => {
      const w = window as unknown as { __prices: string[] }
      w.__prices = []
      new MutationObserver(() => w.__prices.push(el.textContent ?? '')).observe(el, { childList: true, subtree: true, characterData: true })
    })
    await app.mock('changePrice', 'nft-01', 'nft-01-ed-3', '1.40')
    await expect(price).toHaveText('1.40 ETH')
    // Sentinela: outro evento depois do caos; quando ele aparece, os extras do anterior já foram descartados.
    await app.mock('changePrice', 'nft-01', 'nft-01-ed-3', '1.45')
    await expect(price).toHaveText('1.45 ETH')
    const seen = await page.evaluate(() => (window as unknown as { __prices: string[] }).__prices)
    expect(seen.filter((t) => t.includes('999'))).toEqual([])
    await expect(page.getByText('999')).toHaveCount(0)
  })
})
