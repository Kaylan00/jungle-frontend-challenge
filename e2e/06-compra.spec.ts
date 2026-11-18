/** Cenário 6 — compra completa, do catálogo ao recibo confirmado (desktop e mobile). */
import { expect, test } from './fixtures'
import { confirmPurchase, connectAndReview } from './helpers/checkout'

test('compra completa do catálogo ao recibo; recibo é snapshot do pedido', async ({ app, page }) => {
  // Relógio da página controlado pelo teste: o pagamento leva 60 s no cenário e só é confirmado quando o teste
  // avança o tempo até lá (nunca por a máquina estar lenta ou rápida).
  await page.clock.install()
  await app.login('ana')
  await app.setScenario({ paymentDelayMs: 60_000 })
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

  // Pendente → confirmado (evento order.updated pelo Socket.IO), no tempo do relógio controlado
  await expect(page).toHaveURL(/\/pedido\//)
  const order = page.getByTestId('order-page')
  await expect(order).toHaveAttribute('data-status', 'pending')
  await page.clock.fastForward('00:30')
  expect((await app.mock('getOrders'))[0]?.status).toBe('pending') // antes do prazo do pagamento, segue pendente
  await expect(order).toHaveAttribute('data-status', 'pending')
  await page.clock.fastForward('00:31')
  await expect(order).toHaveAttribute('data-status', 'confirmed')
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

test('compra confirmada com itens sobrando no carrinho: o cupom continua aplicado sobre o que ficou', async ({ app, page }) => {
  await page.clock.install()
  await app.login('ana')
  await app.addToCart('nft-01', { edition: 'nft-01-ed-3' })
  await page.getByLabel('Código promocional').fill('KURIO10')
  await page.getByRole('button', { name: 'Aplicar' }).click()
  await expect(page.getByTestId('applied-coupon')).toContainText('KURIO10')

  // Pagamento mais lento: dá tempo de pôr outro item no carrinho enquanto o pedido está pendente.
  await app.setScenario({ paymentDelayMs: 6000 })
  await page.getByTestId('checkout-button').click()
  await connectAndReview(page)
  await expect(page.getByTestId('review-dialog').getByTestId('summary-discount')).toHaveText('(-) 0.119 ETH')
  await confirmPurchase(page)
  await expect(page.getByTestId('order-page')).toHaveAttribute('data-status', 'pending')

  // Item que não entrou no pedido (adicionado depois da revisão).
  await app.addToCart('nft-02', { edition: 'nft-02-ed-2' })
  await page.clock.fastForward('00:07')
  await expect.poll(async () => (await app.mock('getOrders'))[0]?.status).toBe('confirmed')

  // Só o comprado saiu; o cupom continua e o desconto é recalculado sobre o que ficou (0.95 − 10%).
  await page.reload()
  await expect(app.cartItems()).toHaveCount(1)
  await expect(app.cartItems().first()).toContainText('Sage Nomad #009')
  await expect(page.getByTestId('applied-coupon')).toContainText('KURIO10')
  await expect(page.getByTestId('summary-subtotal')).toHaveText('0.95 ETH')
  await expect(page.getByTestId('summary-discount')).toHaveText('(-) 0.095 ETH')
})
