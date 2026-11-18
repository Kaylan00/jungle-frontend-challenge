/**
 * Cenário 16 — alerta de preço nos favoritos: o servidor simulado baixa o preço (o mesmo evento nft.updated
 * de sempre, pelo Socket.IO) e só o dono dos favoritos recebe o aviso (toast + aria-live) e o selo na lista.
 */
import { expect, test } from './fixtures'

test.describe('Alerta de preço nos favoritos', () => {
  test('favorito que baixa de preço: aviso com link, região aria-live e selo na lista de interesse', async ({ app, page }) => {
    await app.login('ana')
    await app.goto('/perfil/favoritos')
    await app.realtimeConnected()
    await expect(page.getByTestId('favorites-grid').getByTestId('nft-card')).toHaveCount(2)

    await app.mock('changePrice', 'nft-01', 'nft-01-ed-3', '0.99')
    const message = 'Preço caiu: Emerald Ape #042 de 1.19 ETH para 0.99 ETH'
    await expect(page.locator('[data-sonner-toast]').getByText(message)).toBeVisible()
    await expect(page.getByTestId('live-polite')).toHaveText(message)
    const badge = page.getByTestId('price-drop-badge')
    await expect(badge).toHaveCount(1)
    await expect(badge).toContainText('Caiu de 1.19 ETH')
    await expect(page.locator('[data-nft-id="nft-01"]').getByTestId('nft-price')).toHaveText('0.99 ETH')

    // O link do aviso leva ao NFT.
    await page.getByTestId('price-drop-link').click()
    await expect(page).toHaveURL(/\/nft\/nft-01$/)

    // Subir o preço de volta (acima do original) tira o selo; subir não gera aviso.
    await app.goto('/perfil/favoritos')
    await expect(page.getByTestId('price-drop-badge')).toHaveCount(1)
    await app.realtimeConnected()
    await app.mock('changePrice', 'nft-01', 'nft-01-ed-3', '1.30')
    await expect(page.getByTestId('price-drop-badge')).toHaveCount(0)
    await expect(page.locator('[data-nft-id="nft-01"]').getByTestId('nft-price')).toHaveText('1.30 ETH')
  })

  test('só o dono dos favoritos é avisado', async ({ app, page }) => {
    // Bruno favoritou só o nft-05; o nft-01 (que baixa) é favorito da Ana, não dele.
    await app.login('bruno')
    await app.goto('/')
    await app.realtimeConnected()
    await app.mock('changePrice', 'nft-01', 'nft-01-ed-3', '0.99')
    // O evento chegou (o card do catálogo mudou), mas sem aviso de queda.
    await expect(page.locator('[data-nft-id="nft-01"]').first().getByTestId('nft-price')).toHaveText('0.99 ETH')
    await page.waitForTimeout(400)
    await expect(page.getByText(/Preço caiu/)).toHaveCount(0)

    // O favorito dele baixa: aí sim.
    await app.mock('changePrice', 'nft-05', 'nft-05-ed-2', '0.5')
    await expect(page.locator('[data-sonner-toast]').getByText('Preço caiu: Violet Nomad #314 de 0.69 ETH para 0.50 ETH')).toBeVisible()
  })
})
