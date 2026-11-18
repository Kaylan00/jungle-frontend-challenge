/**
 * Cenário 18 — compartilhar o NFT: sem Web Share API copia o link (com "Link copiado"); com ela, entrega o
 * link à folha de compartilhamento do sistema e não copia nada.
 */
import { expect, test } from './fixtures'

test.describe('Compartilhar NFT', () => {
  test('sem navigator.share: copia o link canônico e confirma', async ({ app, page, context, baseURL }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL })
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'share', { value: undefined, configurable: true })
    })
    await app.goto('/nft/nft-01?edicao=nft-01-ed-3')
    const button = page.getByTestId('share-button').filter({ visible: true })
    await button.click()
    await expect(page.locator('[data-sonner-toast]').getByText('Link copiado')).toBeVisible()
    await expect(page.getByTestId('live-polite')).toContainText('Link copiado')
    if (!app.isMobile) await expect(button).toHaveText(/Link copiado/)
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${baseURL}/nft/nft-01?edicao=nft-01-ed-3`)
  })

  test('com navigator.share: abre a folha do sistema com o link e não copia', async ({ app, page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __shared: unknown[] }
      w.__shared = []
      Object.defineProperty(Navigator.prototype, 'share', {
        value: async (data: unknown) => {
          w.__shared.push(data)
        },
        configurable: true,
      })
    })
    await app.goto('/nft/nft-02')
    await page.getByTestId('share-button').filter({ visible: true }).click()
    await expect.poll(() => page.evaluate(() => (window as unknown as { __shared: unknown[] }).__shared)).toEqual([
      { title: 'Sage Nomad #009', text: 'Sage Nomad #009 na Kurio', url: expect.stringMatching(/\/nft\/nft-02$/) },
    ])
    await expect(page.getByText('Link copiado')).toHaveCount(0)
  })
})
