/** Cenário 6 — compra completa, do catálogo ao recibo confirmado (desktop e mobile). */
import { expect, test } from './fixtures'
import { confirmPurchase, connectAndReview } from './helpers/checkout'

test('compra completa do catálogo ao recibo; recibo é snapshot do pedido', async ({ app, page }) => {
  await app.login('ana')
  await app.goto('/')
  await page.locator('[data-nft-id="nft-01"]').getByRole('link', { name: 'Emerald Ape #042' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Emerald Ape #042' })).toBeVisible()
  await app.addToCart('nft-01', { edition: 'nft-01-ed-3', quantity: 2 })

  await page.getByTestId('checkout-button').click()
  await expect(page).toHaveURL(/\/pagamento$/)
  await connectAndReview(page)
  const dialog = page.getByTestId('review-dialog')
  await expect(dialog.getByTestId('summary-total')).toHaveText('2.396 ETH')
  await confirmPurchase(page)

  // Pendente → confirmado (evento order.updated pelo Socket.IO)
  await expect(page).toHaveURL(/\/pedido\//)
  await expect(page.getByTestId('order-page')).toHaveAttribute('data-status', 'pending')
  await expect(page.getByTestId('order-page')).toHaveAttribute('data-status', 'confirmed', { timeout: 10_000 })
  await expect(page.getByTestId('receipt-total')).toHaveText('2.396 ETH')
  await expect(page.getByTestId('tx-hash')).toContainText('0x')

  // Itens comprados saíram do carrinho
  await app.goto('/carrinho')
  await expect(page.getByText('Seu carrinho está vazio')).toBeVisible()

  // Mudança posterior no catálogo não altera o recibo
  await app.mock('changePrice', 'nft-01', 'nft-01-ed-3', '9.99')
  await page.goBack()
  await page.reload()
  await expect(page.getByTestId('receipt-total')).toHaveText('2.396 ETH')
  expect(await app.mock('getOrders')).toHaveLength(1)
})
