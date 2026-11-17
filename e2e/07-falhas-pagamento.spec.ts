/** Cenário 7 — pagamento recusado, clique repetido e timeout com recuperação do mesmo pedido. */
import { expect, test } from './fixtures'
import { connectAndReview } from './helpers/checkout'

test.describe('Falhas no pagamento', () => {
  test.beforeEach(async ({ app }) => {
    await app.login('ana')
    await app.addToCart('nft-07')
    await app.goto('/pagamento')
  })

  test('pagamento recusado mantém os itens no carrinho', async ({ app, page }) => {
    await app.setScenario({ payment: 'reject' })
    await connectAndReview(page)
    await page.getByTestId('confirm-purchase').click()
    await expect(page.getByTestId('order-page')).toHaveAttribute('data-status', 'rejected', { timeout: 10_000 })
    await expect(page.getByRole('heading', { name: 'Pagamento recusado' })).toBeVisible()
    await expect(page.getByTestId('rejection-reason')).toContainText('saldo insuficiente')
    await page.getByRole('link', { name: 'Voltar ao carrinho' }).click()
    await expect(app.cartItems()).toHaveCount(1)
  })

  test('cliques repetidos geram um único pedido', async ({ app, page }) => {
    await connectAndReview(page)
    const confirm = page.getByTestId('confirm-purchase')
    await confirm.dblclick()
    await confirm.click({ force: true, timeout: 1_000 }).catch(() => undefined)
    await expect(page).toHaveURL(/\/pedido\//)
    expect(await app.mock('getOrders')).toHaveLength(1)
  })

  test('timeout depois de criar o pedido: reenvio com a mesma chave recupera o mesmo pedido', async ({ app, page }) => {
    await app.setScenario({ orderTimeoutOnce: true })
    await connectAndReview(page)
    await page.getByTestId('confirm-purchase').click()
    // Cliente desiste após 8 s, reenvia com a mesma Idempotency-Key e recebe o pedido já criado
    await expect(page).toHaveURL(/\/pedido\//, { timeout: 20_000 })
    const orders = await app.mock('getOrders')
    expect(orders).toHaveLength(1)
    await expect(page.getByTestId('order-page')).toHaveAttribute('data-status', 'confirmed', { timeout: 10_000 })
  })

  test('refresh no meio do envio recupera o mesmo pedido sem duplicar', async ({ app, page }) => {
    await app.setScenario({ orderTimeoutOnce: true })
    await connectAndReview(page)
    await page.getByTestId('confirm-purchase').click()
    await page.waitForTimeout(500)
    await page.reload()
    await expect(page).toHaveURL(/\/pedido\//, { timeout: 15_000 })
    expect(await app.mock('getOrders')).toHaveLength(1)
  })

  test('contrato de idempotência: mesma chave recupera o pedido, conteúdo diferente gera 409', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const token = localStorage.getItem('jungle.session.token')
      const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      await fetch('/api/wallets/wal-ana-1/connect', { method: 'POST', headers: auth, body: JSON.stringify({ network: 'ethereum' }) })
      const quote = await (await fetch('/api/quotes', { method: 'POST', headers: auth, body: JSON.stringify({ network: 'ethereum', couponCode: null }) })).json()
      const body = (note: string) =>
        JSON.stringify({
          quoteId: quote.id,
          fingerprint: quote.fingerprint,
          walletId: 'wal-ana-1',
          network: 'ethereum',
          provider: 'metamask',
          collector: { displayName: 'Ana', username: 'ana_nft', profileName: 'ana.kurio', email: 'ana@kurio.test', ensName: 'ana-kurio', referralCode: 'KURIO-ANA', note },
        })
      const headers = { ...auth, 'Idempotency-Key': 'e2e-chave-fixa' }
      const first = await fetch('/api/orders', { method: 'POST', headers, body: body('') })
      const again = await fetch('/api/orders', { method: 'POST', headers, body: body('') })
      const changed = await fetch('/api/orders', { method: 'POST', headers, body: body('outro conteúdo') })
      const a = await first.json()
      const b = await again.json()
      const c = await changed.json()
      return { s1: first.status, s2: again.status, replay: again.headers.get('Idempotent-Replayed'), sameId: a.id === b.id, s3: changed.status, code: c.error?.code }
    })
    expect(result).toEqual({ s1: 201, s2: 200, replay: 'true', sameId: true, s3: 409, code: 'IDEMPOTENCY_CONFLICT' })
  })
})
