/** Cenário 5 — carrinho: quantidades, remoção, cupom, persistência após refresh e login. */
import { expect, test, USERS } from './fixtures'

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

    // Login preserva os itens e o cupom do visitante (a conta não tinha cupom) e o resumo segue a API
    await app.login('bruno')
    await app.goto('/carrinho')
    await expect(app.cartItems()).toHaveCount(1)
    await expect(app.cartItems().first()).toContainText('Sage Nomad #009')
    await expect(page.getByTestId('applied-coupon')).toContainText('KURIO10')
    await expect(page.getByTestId('summary-discount')).toBeVisible()
  })

  test('sem conta, "Conectar e finalizar" abre o login por cima do carrinho e segue para o pagamento', async ({ app, page }) => {
    await app.addToCart('nft-02', { edition: 'nft-02-ed-1' })
    const main = page.locator('main#conteudo')
    const checkout = page.getByTestId('checkout-button')
    const dialog = page.getByRole('dialog')

    await checkout.click()
    await expect(page).toHaveURL(/\/login\?redirect=%2Fpagamento$/)
    await expect(dialog).toBeVisible()
    // Fundo = o próprio carrinho (continua montado, inerte), não a página inicial
    await expect(main.getByTestId(app.isMobile ? 'cart-item-mobile' : 'cart-item')).toHaveCount(1)
    await expect(main.getByTestId('catalog-grid')).toHaveCount(0)
    await expect(page.locator('[inert] main#conteudo')).toHaveCount(1)

    // Esc fecha e volta ao carrinho, com o foco de volta no botão
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(page).toHaveURL(/\/carrinho$/)
    await expect(checkout).toBeFocused()

    // Voltar e avançar do navegador
    await checkout.click()
    await expect(dialog).toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(/\/carrinho$/)
    await expect(dialog).toBeHidden()
    await page.goForward()
    await expect(page).toHaveURL(/\/login\?redirect=%2Fpagamento$/)
    await expect(dialog).toBeVisible()
    await expect(main.getByTestId(app.isMobile ? 'cart-item-mobile' : 'cart-item')).toHaveCount(1)

    // Refresh: rota /login comum (fundo = início), mesmo destino
    await page.reload()
    await expect(dialog).toBeVisible()
    await expect(page).toHaveURL(/\/login\?redirect=%2Fpagamento$/)
    await expect(main.getByTestId(app.isMobile ? 'cart-item-mobile' : 'cart-item')).toHaveCount(0)

    // Entrar segue para o pagamento
    await dialog.getByLabel('E-mail').fill(USERS.ana.email)
    await dialog.getByLabel('Senha', { exact: true }).fill(USERS.ana.password)
    await dialog.getByRole('button', { name: 'Entrar', exact: true }).click()
    await expect(page).toHaveURL(/\/pagamento$/)
    await expect(dialog).toBeHidden()
  })
})

test('mobile: a seta "Voltar" do carrinho nunca leva de volta ao pagamento', async ({ app, page }) => {
  test.skip(!app.isMobile, 'A seta "Voltar" do carrinho existe só no mobile')
  await app.login('ana')
  await app.addToCart('nft-01', { edition: 'nft-01-ed-3' })
  await page.getByRole('button', { name: /Conectar e finalizar/ }).first().click()
  await expect(page).toHaveURL(/\/pagamento$/)
  await page.goBack()
  await expect(page).toHaveURL(/\/carrinho$/)
  await page.getByRole('button', { name: 'Voltar' }).first().click()
  await expect(page).toHaveURL(/\/$/)
})
