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

    // Grava cada texto que o preço assumir e cada anúncio para leitor de tela a partir daqui.
    await price.evaluate((el) => {
      const w = window as unknown as { __prices: string[]; __announced: string[] }
      w.__prices = []
      w.__announced = []
      new MutationObserver(() => w.__prices.push(el.textContent ?? '')).observe(el, { childList: true, subtree: true, characterData: true })
      const live = document.querySelector('[data-testid="live-polite"]')
      if (live) new MutationObserver(() => live.textContent && w.__announced.push(live.textContent)).observe(live, { childList: true, subtree: true, characterData: true })
    })
    await app.mock('reemitLastEvent') // mesmo eventId do 1.40
    await app.mock('emitStaleNftEvent', 'nft-01') // versão menor, com preço 999
    // Sentinela: evento novo e válido. Os eventos chegam em ordem pelo mesmo socket.
    await app.mock('changePrice', 'nft-01', 'nft-01-ed-3', '1.45')
    await expect(price).toHaveText('1.45 ETH')

    const seen = await page.evaluate(() => {
      const w = window as unknown as { __prices: string[]; __announced: string[] }
      return { prices: w.__prices, announced: w.__announced }
    })
    expect(seen.prices.filter((t) => t.includes('999'))).toEqual([]) // o antigo nunca chegou à tela
    expect(seen.prices.filter((t) => t.trim() === '1.40 ETH')).toEqual([]) // o duplicado não redesenhou nada
    expect(seen.announced.filter((t) => t.includes('1.40'))).toEqual([]) // nem foi anunciado de novo
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

  test('troca de usuário na mesma aba: o pedido da conta anterior não atualiza nada da conta atual', async ({ app, page }) => {
    await app.login('ana')
    await app.addToCart('nft-07')
    await app.setScenario({ paymentDelayMs: 600_000 }) // o pedido da Ana fica pendente até liberarmos
    await page.getByTestId('checkout-button').click()
    await connectAndReview(page)
    await page.getByTestId('confirm-purchase').click()
    await expect(page.getByTestId('order-page')).toHaveAttribute('data-status', 'pending')
    const anaOrderUrl = page.url()

    // Ana sai; Bruno entra na mesma aba (mesmo socket reaproveitado)
    await app.goto('/perfil')
    await page.getByRole('button', { name: 'Sair' }).click()
    await page.waitForFunction(() => !localStorage.getItem('jungle.session.token'))
    await app.login('bruno')
    await app.goto('/')
    await app.realtimeConnected()

    // Grava tudo o que for anunciado na tela do Bruno a partir daqui
    await page.evaluate(() => {
      const w = window as unknown as { __announced: string[] }
      w.__announced = []
      for (const live of document.querySelectorAll('[aria-live]')) {
        new MutationObserver(() => live.textContent && w.__announced.push(live.textContent)).observe(live, { childList: true, subtree: true, characterData: true })
      }
    })
    await app.mock('settleNow') // o servidor confirma o pedido da Ana e emite order.updated (userId da Ana)
    // Sentinela: evento de catálogo que o Bruno recebe. Quando ele aparece, o de pedido já foi tratado.
    await app.mock('changePrice', 'nft-02', 'nft-02-ed-2', '0.51')
    await expect(page.locator('[data-nft-id="nft-02"]').first().getByTestId('nft-price')).toHaveText('0.51 ETH')

    const announced = await page.evaluate(() => (window as unknown as { __announced: string[] }).__announced)
    expect(announced.filter((t) => /pagamento|pedido/i.test(t))).toEqual([])
    await expect(page.locator('[data-sonner-toast]').getByText(/pagamento|pedido/i)).toHaveCount(0)
    expect((await app.mock('getOrders')).map((o) => o.status)).toEqual(['confirmed'])

    // E o Bruno não abre o pedido da Ana pelo endereço
    await page.goto(anaOrderUrl)
    await expect(page.getByTestId('receipt-total')).toHaveCount(0)
  })
})
