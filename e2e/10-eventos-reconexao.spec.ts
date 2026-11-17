/** Cenário 10 — eventos duplicados ou antigos, desconexão e retomada de pedido pendente. */
import { expect, test } from './fixtures'
import { connectAndReview } from './helpers/checkout'

test.describe('Resiliência do tempo real', () => {
  test('evento duplicado não reaplica e evento antigo não regride o preço', async ({ app, page }) => {
    await app.goto('/nft/nft-01?edicao=nft-01-ed-3')
    await app.realtimeConnected()
    const price = page.getByTestId('detail-price')
    test.skip(app.isMobile, 'Preço do detalhe desktop; mobile usa o mesmo cache')
    await expect(price).toHaveText('1.19 ETH')

    await app.mock('changePrice', 'nft-01', 'nft-01-ed-3', '1.40')
    await expect(price).toHaveText('1.40 ETH')
    await app.mock('reemitLastEvent') // mesmo eventId
    await app.mock('emitStaleNftEvent', 'nft-01') // versão menor com preço 999
    await page.waitForTimeout(500)
    await expect(price).toHaveText('1.40 ETH')
    await expect(page.getByText('999')).toHaveCount(0)
  })

  test('queda do socket: reconecta e reconcilia com a REST', async ({ app, page }) => {
    await app.goto('/')
    await app.realtimeConnected()
    await app.mock('setRealtimeOffline', true)
    await expect(page.getByTestId('realtime-status')).toHaveAttribute('data-status', /reconnecting|offline/)
    // Mudança enquanto offline: o evento se perde
    await app.mock('changePrice', 'nft-02', 'nft-02-ed-2', '0.50')
    await app.mock('setRealtimeOffline', false)
    await app.realtimeConnected()
    // Reconciliação: a listagem é buscada de novo e mostra o preço atual
    await expect(page.locator('[data-nft-id="nft-02"]').getByTestId('nft-price')).toHaveText('0.50 ETH')
  })

  test('pedido pendente sobrevive à queda do socket e ao refresh, sem nova compra', async ({ app, page }) => {
    await app.login('ana')
    await app.addToCart('nft-07')
    await app.setScenario({ paymentDelayMs: 600_000 }) // fica pendente até liberarmos
    await page.getByTestId('checkout-button').click()
    await connectAndReview(page)
    await page.getByTestId('confirm-purchase').click()
    await expect(page.getByTestId('order-page')).toHaveAttribute('data-status', 'pending')

    await app.mock('setRealtimeOffline', true)
    await page.reload()
    await expect(page.getByTestId('order-page')).toHaveAttribute('data-status', 'pending')
    await app.mock('settleNow') // servidor confirma enquanto o socket está fora
    await app.mock('setRealtimeOffline', false)
    await expect(page.getByTestId('order-page')).toHaveAttribute('data-status', 'confirmed', { timeout: 10_000 })
    expect(await app.mock('getOrders')).toHaveLength(1)

    // Terminal: um evento antigo não volta o pedido para pendente
    await app.mock('reemitLastEvent')
    await expect(page.getByTestId('order-page')).toHaveAttribute('data-status', 'confirmed')
  })
})
