/** Cenário 5 — carrinho: quantidades, remoção, cupom, persistência após refresh e login. */
import { expect, test } from './fixtures'

test.describe('Carrinho', () => {
  test('quantidade, cupom inválido/expirado/válido, remoção e persistência após refresh e login', async ({ app, page }) => {
    // Visitante: Sage Nomad #009, edição 1/10 (até 2 por pedido)
    await app.addToCart('nft-02', { edition: 'nft-02-ed-1' })
    const items = app.cartItems()
    await expect(items).toHaveCount(1)
    const plus = items.first().getByRole('button', { name: /Aumentar quantidade/ })
    await plus.click()
    await expect(items.first().getByTestId('quantity-value')).toHaveText('2')
    await expect(plus).toBeDisabled() // limite por pedido

    await items.first().getByRole('button', { name: /Diminuir quantidade/ }).click()
    await expect(items.first().getByTestId('quantity-value')).toHaveText('1')

    // Cupons
    const coupon = page.getByLabel('Código promocional')
    await coupon.fill('NAOEXISTE')
    await page.getByRole('button', { name: 'Aplicar' }).click()
    await expect(page.getByTestId('coupon-error')).toHaveText('Cupom inválido')
    await coupon.fill('BLACK2025')
    await page.getByRole('button', { name: 'Aplicar' }).click()
    await expect(page.getByTestId('coupon-error')).toHaveText('Este cupom expirou')
    await coupon.fill('kurio10')
    await page.getByRole('button', { name: 'Aplicar' }).click()
    await expect(page.getByTestId('applied-coupon')).toContainText('KURIO10')
    // 1.69 − 10% (0.169) + taxa 0.016 = 1.537 (calculado pela API, sem erro de ponto flutuante)
    await expect(page.getByTestId('summary-subtotal')).toHaveText('1.69 ETH')
    await expect(page.getByTestId('summary-discount')).toHaveText('(-) 0.169 ETH')
    await expect(page.getByTestId('summary-total')).toHaveText('1.537 ETH')

    // Refresh mantém carrinho e cupom
    await page.reload()
    await expect(app.cartItems()).toHaveCount(1)
    await expect(page.getByTestId('applied-coupon')).toContainText('KURIO10')

    // Segundo item e remoção
    await app.addToCart('nft-07')
    await expect(app.cartItems()).toHaveCount(2)
    await app.cartItems().filter({ hasText: 'Golden Beat #207' }).getByRole('button', { name: /Remover Golden Beat/ }).click()
    await expect(app.cartItems()).toHaveCount(1)

    // Login preserva os itens do visitante
    await app.login('bruno')
    await app.goto('/carrinho')
    await expect(app.cartItems()).toHaveCount(1)
    await expect(app.cartItems().first()).toContainText('Sage Nomad #009')
  })
})
