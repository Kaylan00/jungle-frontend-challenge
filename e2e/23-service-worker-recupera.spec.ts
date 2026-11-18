/**
 * Cenário 23 — o service worker do MSW cai no meio do uso e a demonstração se recupera sozinha.
 *
 * O navegador encerra service workers ociosos; quando o worker volta, volta "zerado" e deixa os pedidos da
 * API passarem direto para o host (que responde o index.html). O cliente HTTP trata isso como falha de
 * conexão transitória (o retry do Query repete) e a camada de mocks (src/mocks/browser.ts) percebe o pedido
 * que escapou, confirma pelo GET /api/__health e religa o worker. Nenhum erro chega à tela.
 *
 * Usa o protocolo do Chromium (CDP) para encerrar o worker como o navegador faria.
 */
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

async function killServiceWorker(page: Page, opts: { unregister: boolean }) {
  if (opts.unregister) {
    await page.evaluate(async () => {
      for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister()
    })
  }
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('ServiceWorker.enable')
  await cdp.send('ServiceWorker.stopAllWorkers')
  await cdp.detach()
}

/** O pedido da API agora escapa do mock (prova de que o worker realmente caiu antes do clique). */
async function apiEscapes(page: Page) {
  return page.evaluate(async () => {
    const res = await fetch('/api/__health', { cache: 'no-store' })
    return !(res.headers.get('content-type') ?? '').includes('json')
  })
}

test.describe('Service worker do MSW cai no meio do uso', () => {
  test.beforeEach(({ app }) => {
    test.skip(app.isMobile, 'Camada de rede da demonstração: independe do layout')
  })

  for (const unregister of [false, true]) {
    test(`${unregister ? 'desregistrado e encerrado' : 'encerrado pelo navegador'}: "Página 3" mostra os 9 cards sem erro`, async ({ app, page }) => {
      await app.goto('/')
      const grid = page.getByTestId('catalog-grid')
      await expect(grid.getByTestId('nft-card')).toHaveCount(9)
      const firstOnPage1 = await grid.getByTestId('nft-card').first().getAttribute('data-nft-id')

      await killServiceWorker(page, { unregister })
      // O worker caiu de fato (a própria verificação de saúde não dispara a religada: só pedidos do app).
      expect(await apiEscapes(page)).toBe(true)
      const restartsBefore = await app.mock('workerRestarts')

      await page.getByRole('button', { name: 'Página 3', exact: true }).click()
      await expect(page).toHaveURL(/[?&]page=3/)
      await expect(page.getByTestId('results-summary')).toContainText('Página 3 de')
      await expect(grid.getByTestId('nft-card')).toHaveCount(9)
      expect(await grid.getByTestId('nft-card').first().getAttribute('data-nft-id')).not.toBe(firstOnPage1)
      await expect(page.getByText('Não foi possível carregar o catálogo')).toHaveCount(0)

      // Quem consertou foi o vigia da camada de mocks, e o worker voltou a atender.
      expect(await app.mock('workerRestarts')).toBeGreaterThan(restartsBefore)
      expect(await apiEscapes(page)).toBe(false)

      // E o uso segue normal (o worker está de pé).
      await page.getByRole('button', { name: 'Página 1', exact: true }).click()
      await expect(page.getByTestId('results-summary')).toContainText('Página 1 de')
    })
  }
})
