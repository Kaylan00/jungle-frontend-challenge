/** Cenário 4 — favoritos, incluindo falha de mutation (rollback do otimista) e recuperação. */
import { expect, test } from './fixtures'

test.describe('Favoritos', () => {
  test('visitante é levado ao login ao favoritar', async ({ app, page }) => {
    await app.goto('/')
    await page.locator('[data-nft-id="nft-02"]').getByTestId('favorite-button').click()
    await expect(page).toHaveURL(/\/login\?redirect=/)
  })

  test('favoritar persiste; falha da API desfaz o otimista e nova tentativa funciona', async ({ app, page }) => {
    await app.login('ana')
    await app.goto('/')
    const button = page.locator('[data-nft-id="nft-02"]').getByTestId('favorite-button')
    await expect(button).toHaveAttribute('aria-pressed', 'false')

    // Falha uma vez no servidor
    await app.setScenario({ faults: [{ route: 'PUT /api/favorites/*', kind: 'http500', times: 1 }] })
    await button.click()
    await expect(page.getByText(/Não foi possível favoritar Sage Nomad #009/).first()).toBeVisible()
    await expect(button).toHaveAttribute('aria-pressed', 'false') // rollback

    // Recuperação: segunda tentativa funciona e persiste após refresh
    await button.click()
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    await page.reload()
    await expect(page.locator('[data-nft-id="nft-02"]').getByTestId('favorite-button')).toHaveAttribute('aria-pressed', 'true')

    // Desfavoritar
    await page.locator('[data-nft-id="nft-02"]').getByTestId('favorite-button').click()
    await expect(page.locator('[data-nft-id="nft-02"]').getByTestId('favorite-button')).toHaveAttribute('aria-pressed', 'false')
  })
})
