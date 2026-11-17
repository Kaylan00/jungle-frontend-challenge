/** Cenário 12 — skeletons em carregamento lento, feedback de falha e recuperação com nova tentativa. */
import { expect, test } from './fixtures'

test.describe('Carregamento e falhas de rede', () => {
  test('skeleton com shimmer no catálogo e no detalhe durante rede lenta', async ({ app, page }) => {
    await app.goto('/')
    await app.setScenario({ latency: 'slow' })
    await page.reload()
    const loading = page.getByTestId('catalog-loading')
    await expect(loading).toBeVisible()
    await expect(loading).toHaveAttribute('aria-busy', 'true')
    await expect(page.getByTestId('catalog-grid')).toBeVisible({ timeout: 10_000 })
    await expect(loading).toBeHidden()

    await app.goto('/nft/nft-05')
    await expect(page.getByTestId('detail-loading')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Violet Nomad #314' })).toBeVisible({ timeout: 10_000 })
  })

  test('erro 500 no catálogo: mensagem, nova tentativa e recuperação', async ({ app, page }) => {
    await app.goto('/')
    // Falha em toda tentativa (inicial + 2 retries automáticos) até o "servidor" voltar
    await app.setScenario({ faults: [{ route: 'GET /api/nfts', kind: 'http500', times: -1 }] })
    await page.reload()
    await expect(page.getByText('Não foi possível carregar o catálogo')).toBeVisible({ timeout: 15_000 })
    await app.setScenario({ faults: [] })
    await page.getByRole('button', { name: 'Tentar novamente' }).click()
    await expect(page.getByTestId('catalog-grid').getByTestId('nft-card')).toHaveCount(9)
  })

  test('sem conexão no carrinho: feedback e recuperação', async ({ app, page }) => {
    await app.goto('/')
    await app.setScenario({ faults: [{ route: 'GET /api/cart', kind: 'network', times: -1 }] })
    await app.goto('/carrinho')
    await expect(page.getByText('Não foi possível carregar o carrinho')).toBeVisible({ timeout: 15_000 })
    await app.setScenario({ faults: [] })
    await page.getByRole('button', { name: 'Tentar novamente' }).click()
    await expect(page.getByText('Seu carrinho está vazio')).toBeVisible()
  })
})
