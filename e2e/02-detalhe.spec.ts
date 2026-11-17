/** Cenário 2 — acesso direto ao detalhe e tratamento de recurso inexistente. */
import { expect, test } from './fixtures'

test.describe('Detalhe do NFT', () => {
  test('acesso direto mostra o NFT, edição indisponível e limite de quantidade', async ({ app, page }) => {
    await app.goto('/nft/nft-03')
    await expect(page.getByRole('heading', { level: 1, name: 'Neon Vessel #552' })).toBeVisible()

    // Edição fora de venda: não permite comprar
    await page.getByRole('radio', { name: /12\.30 ETH, indisponível/ }).click()
    await expect(page.getByTestId('unavailable-reason')).toHaveText('Esta edição não está à venda.')

    // Limite de quantidade (1/50 do Emerald Ape: até 10 por pedido)
    await app.goto('/nft/nft-01?edicao=nft-01-ed-3')
    const scope = app.isMobile ? page.getByTestId('mobile-buy-bar') : page.locator('article')
    const plus = scope.getByRole('button', { name: 'Aumentar quantidade' }).first()
    for (let i = 0; i < 9; i++) await plus.click()
    await expect(scope.getByTestId('quantity-value').first()).toHaveText('10')
    await expect(plus).toBeDisabled()
    await expect(page.getByTestId('edition-availability')).toContainText('até 10 por pedido')
  })

  test('NFT inexistente e rota inexistente mostram páginas próprias', async ({ app, page }) => {
    await app.goto('/nft/nao-existe-123')
    await expect(page.getByRole('heading', { name: 'NFT não encontrado' })).toBeVisible()
    await page.getByRole('link', { name: 'Voltar para o início' }).click()
    await expect(page).toHaveURL(/\/$/)

    await app.goto('/rota/que/nao/existe')
    await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible()
  })
})
