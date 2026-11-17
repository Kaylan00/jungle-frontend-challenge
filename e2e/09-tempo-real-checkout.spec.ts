/**
 * Cenário 9 — preço/disponibilidade mudam via Socket.IO durante o checkout.
 * Os eventos saem do servidor simulado e chegam pelo socket.io-client (nada é injetado na UI).
 */
import { expect, test } from './fixtures'
import { connectAndReview } from './helpers/checkout'

test.describe('Tempo real no carrinho e no checkout', () => {
  test.beforeEach(async ({ app }) => {
    await app.login('ana')
    await app.addToCart('nft-01', { edition: 'nft-01-ed-3' })
    await app.realtimeConnected()
  })

  test('carrinho aberto: avisa a mudança de preço, atualiza o resumo e trava o checkout se esgotar', async ({ app, page }) => {
    await expect(page.getByTestId('summary-subtotal')).toHaveText('1.19 ETH')
    await app.mock('changePrice', 'nft-01', 'nft-01-ed-3', '1.35')
    await expect(page.getByTestId('price-change-alert')).toContainText('O preço de Emerald Ape #042 mudou')
    await expect(page.getByTestId('summary-subtotal')).toHaveText('1.35 ETH')
    await expect(page.getByTestId('live-polite')).toContainText('Emerald Ape #042')

    await app.mock('setAvailability', 'nft-01', 'nft-01-ed-3', 0)
    await expect(page.getByText(/Edição esgotada/).filter({ visible: true }).first()).toBeVisible()
    await expect(page.getByTestId('checkout-button')).toBeDisabled()
  })

  test('revisão aberta: evento de preço trava a confirmação até atualizar a cotação', async ({ app, page }) => {
    await page.getByTestId('checkout-button').click()
    await connectAndReview(page)
    await expect(page.getByTestId('review-dialog').getByTestId('summary-total')).toHaveText('1.206 ETH')

    await app.mock('changePrice', 'nft-01', 'nft-01-ed-3', '1.50')
    await expect(page.getByTestId('quote-stale')).toBeVisible()
    await expect(page.getByTestId('confirm-purchase')).toBeDisabled()

    await page.getByRole('button', { name: 'Atualizar revisão' }).click()
    await expect(page.getByTestId('review-dialog').getByTestId('summary-total')).toHaveText('1.516 ETH')
    await expect(page.getByTestId('confirm-purchase')).toBeEnabled()
  })

  test('sem o evento (socket fora), o servidor recusa a cotação antiga e exige nova confirmação', async ({ app, page }) => {
    await page.getByTestId('checkout-button').click()
    await connectAndReview(page)
    await app.mock('setRealtimeOffline', true)
    await app.mock('changePrice', 'nft-01', 'nft-01-ed-3', '1.50')
    await page.getByTestId('confirm-purchase').click()
    await expect(page.getByTestId('review-notice')).toContainText('Os valores mudaram')
    await expect(page.getByTestId('review-dialog').getByTestId('summary-total')).toHaveText('1.516 ETH')
    expect(await app.mock('getOrders')).toHaveLength(0)
    await page.getByTestId('confirm-purchase').click()
    await expect(page).toHaveURL(/\/pedido\//)
  })
})
