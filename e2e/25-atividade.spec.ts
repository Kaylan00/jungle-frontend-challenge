/**
 * Cenário 25 — histórico de compras ("Atividade" no perfil): lista da API só com os pedidos da conta, status que
 * muda ao vivo pelo Socket.IO (pendente → confirmado), recusa com o motivo, link para o recibo, estados vazio e axe.
 */
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './fixtures'
import { connectAndReview } from './helpers/checkout'

test.describe('Atividade (histórico de compras)', () => {
  test('conta sem compras: estado vazio com caminho para o catálogo', async ({ app, page }) => {
    await app.login('bruno')
    await app.goto('/perfil/atividade')
    await expect(page.getByText('Você ainda não comprou nenhum NFT')).toBeVisible()
    await page.getByRole('link', { name: 'Explorar o catálogo' }).click()
    await expect(page).toHaveURL(/\/#catalogo$/)
  })

  test('compra pendente aparece na lista e vira confirmada ao vivo, com anúncio e link para o recibo', async ({ app, page }) => {
    // Relógio da página controlado: o pagamento leva 60 s e só confirma quando o teste avança o tempo.
    await page.clock.install()
    await app.login('ana')
    await app.setScenario({ paymentDelayMs: 60_000 })
    await app.addToCart('nft-01', { edition: 'nft-01-ed-3' })
    await page.getByTestId('checkout-button').click()
    await connectAndReview(page)
    const total = await page.getByTestId('review-dialog').getByTestId('summary-total').textContent()
    await page.getByTestId('confirm-purchase').click()
    await expect(page.getByTestId('order-page')).toHaveAttribute('data-status', 'pending')

    // Pelo menu do perfil
    await app.goto('/perfil')
    await page.getByRole('link', { name: 'Atividade' }).first().click()
    await expect(page).toHaveURL(/\/perfil\/atividade$/)
    const row = page.getByTestId('activity-order')
    await expect(row).toHaveCount(1)
    await expect(row).toHaveAttribute('data-status', 'pending')
    await expect(row.getByTestId('order-status')).toHaveText('Pendente')
    await expect(row).toContainText('Emerald Ape #042')
    await expect(row.getByTestId('activity-total')).toHaveText(total!)

    // O servidor confirma o pagamento: a lista muda sem recarregar e o leitor de tela é avisado
    await page.clock.fastForward('01:01')
    await expect(row).toHaveAttribute('data-status', 'confirmed')
    await expect(row.getByTestId('order-status')).toHaveText('Confirmado')
    await expect(page.getByTestId('live-assertive')).toContainText(/Pedido .+ confirmado/)

    await row.getByRole('link', { name: /Ver recibo do pedido/ }).click()
    await expect(page).toHaveURL(/\/pedido\//)
    await expect(page.getByTestId('order-page')).toHaveAttribute('data-status', 'confirmed')
  })

  test('pagamento recusado aparece como Recusado, com o motivo', async ({ app, page }) => {
    await app.login('ana')
    await app.setScenario({ payment: 'reject' })
    await app.addToCart('nft-07')
    await page.getByTestId('checkout-button').click()
    await connectAndReview(page)
    await page.getByTestId('confirm-purchase').click()
    await expect(page.getByTestId('order-page')).toHaveAttribute('data-status', 'rejected')

    await app.goto('/perfil/atividade')
    const row = page.getByTestId('activity-order')
    await expect(row).toHaveAttribute('data-status', 'rejected')
    await expect(row.getByTestId('order-status')).toHaveText('Recusado')
    await expect(row).toContainText('Pagamento recusado pela carteira')
  })

  test('cada conta vê só as próprias compras', async ({ app, page }) => {
    await app.login('ana')
    await app.setScenario({ payment: 'reject' })
    await app.addToCart('nft-07')
    await page.getByTestId('checkout-button').click()
    await connectAndReview(page)
    await page.getByTestId('confirm-purchase').click()
    await expect(page.getByTestId('order-page')).toHaveAttribute('data-status', 'rejected')
    await app.goto('/perfil/atividade')
    await expect(page.getByTestId('activity-order')).toHaveCount(1)

    await page.getByRole('button', { name: 'Sair' }).click()
    await page.waitForFunction(() => !localStorage.getItem('jungle.session.token'))
    await app.login('bruno')
    await app.goto('/perfil/atividade')
    await expect(page.getByText('Você ainda não comprou nenhum NFT')).toBeVisible()
    await expect(page.getByTestId('activity-order')).toHaveCount(0)
  })

  test('sem violações sérias de acessibilidade (axe) com pedidos na lista', async ({ app, page }) => {
    await app.login('ana')
    await app.setScenario({ payment: 'reject' })
    await app.addToCart('nft-07')
    await page.getByTestId('checkout-button').click()
    await connectAndReview(page)
    await page.getByTestId('confirm-purchase').click()
    await expect(page.getByTestId('order-page')).toHaveAttribute('data-status', 'rejected')
    await app.goto('/perfil/atividade')
    await expect(page.getByTestId('activity-order')).toHaveCount(1)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    expect(serious.map((v) => `${v.id} (${v.nodes.length})`)).toEqual([])
  })
})
