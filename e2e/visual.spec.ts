/**
 * Regressão visual de início, detalhe, carrinho e pagamento (desktop e mobile).
 * Dados estáveis: seed fixa, latência zero, datas fixas e animações desligadas.
 * Baselines versionadas em e2e/__screenshots__. Atualizar: npm run test:e2e:update
 */
import { expect, test } from './fixtures'
import type { Page } from '@playwright/test'

async function settle(page: Page) {
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() => Promise.all(Array.from(document.images).map((img) => (img.complete ? null : new Promise((r) => (img.onload = img.onerror = r))))))
}

// O painel de cenários e o indicador de conexão não fazem parte do layout do Figma.
const hide = (page: Page) => [page.getByRole('button', { name: /painel de cenários/ }), page.getByTestId('realtime-status')]

test.describe('Regressão visual', () => {
  test('início', async ({ app, page }) => {
    await app.goto('/')
    await settle(page)
    await expect(page).toHaveScreenshot('inicio.png', { fullPage: true, mask: hide(page) })
  })

  test('detalhe', async ({ app, page }) => {
    await app.goto('/nft/nft-01')
    await settle(page)
    await expect(page).toHaveScreenshot('detalhe.png', { fullPage: true, mask: hide(page) })
  })

  test('carrinho', async ({ app, page }) => {
    await app.addToCart('nft-01', { edition: 'nft-01-ed-3', quantity: 2 })
    await app.addToCart('nft-05', { edition: 'nft-05-ed-2' })
    await settle(page)
    await expect(page).toHaveScreenshot('carrinho.png', { fullPage: true, mask: hide(page) })
  })

  test('pagamento', async ({ app, page }) => {
    await app.login('ana')
    await app.addToCart('nft-01', { edition: 'nft-01-ed-3', quantity: 2 })
    await app.goto('/pagamento')
    await expect(page.getByTestId('checkout-form')).toBeVisible()
    await settle(page)
    await expect(page).toHaveScreenshot('pagamento.png', { fullPage: true, mask: hide(page) })
  })
})
