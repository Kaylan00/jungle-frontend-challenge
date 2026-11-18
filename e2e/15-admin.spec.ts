/**
 * Cenário 15 — painel admin (/admin): permissão (login e 403 de verdade da API), edição de preço com
 * propagação AO VIVO para outra aba do mesmo navegador (pelo socket da outra aba), conflito de versão,
 * destaque e cupom criado no painel valendo no carrinho (e deixando de valer ao desativar).
 */
import { App, expect, test } from './fixtures'

async function openEditions(page: App['page'], nftId: string) {
  const row = page.locator(`[data-testid="admin-nft"][data-nft-id="${nftId}"]`)
  await row.getByRole('button', { name: /^Edições/ }).click()
  return row
}

test.describe('Painel admin', () => {
  test('visitante vai para o login; conta comum recebe 403 da API e vê "Sem permissão"', async ({ app, page }) => {
    await app.goto('/admin')
    await expect(page).toHaveURL(/\/login\?redirect=%2Fadmin/)
    await expect(page.getByRole('dialog')).toBeVisible()

    await app.login('ana')
    // Sem o atalho "Painel" para conta comum.
    if (app.isMobile) {
      await app.goto('/perfil')
      await expect(page.getByRole('navigation', { name: 'Meu perfil' }).getByRole('link', { name: 'Painel' })).toHaveCount(0)
    } else {
      await page.getByRole('button', { name: /Menu da conta/ }).click()
      await expect(page.getByRole('menuitem', { name: 'Dados do perfil' })).toBeVisible()
      await expect(page.getByRole('menuitem', { name: 'Painel' })).toHaveCount(0)
      await page.keyboard.press('Escape')
    }

    await app.goto('/admin')
    await expect(page.getByRole('heading', { name: 'Sem permissão' })).toBeVisible()
    await expect(page.getByTestId('admin-forbidden')).toContainText('Erro 403')

    // A recusa é da API, não só da tela.
    const res = await page.evaluate(async () => {
      const token = localStorage.getItem('jungle.session.token')
      const r = await fetch('/api/admin/nfts', { headers: { Authorization: `Bearer ${token}` } })
      return { status: r.status, code: (await r.json()).error?.code }
    })
    expect(res).toEqual({ status: 403, code: 'FORBIDDEN' })
  })

  test('admin muda o preço e, em outra aba, o comprador vê o preço novo ao vivo pelo socket', async ({ app, page }) => {
    await app.login('admin')
    if (app.isMobile) {
      await app.goto('/perfil')
      await page.getByRole('link', { name: 'Painel' }).click()
      await expect(page).toHaveURL(/\/admin$/)
    } else {
      await page.getByRole('button', { name: /Menu da conta/ }).click()
      await page.getByRole('menuitem', { name: 'Painel' }).click()
    }
    await expect(page.getByRole('heading', { name: 'Painel', level: 1 })).toBeVisible()
    await page.getByLabel('Buscar NFT').fill('Emerald Ape #042')
    await expect(page.getByTestId('admin-nft')).toHaveCount(1)
    const row = await openEditions(page, 'nft-01')

    // Outra aba do mesmo navegador: o comprador no detalhe do NFT.
    const buyerPage = await page.context().newPage()
    const buyer = new App(buyerPage, app.isMobile)
    await buyer.goto('/nft/nft-01?edicao=nft-01-ed-3')
    await buyer.realtimeConnected()
    const price = app.isMobile ? buyerPage.getByTestId('mobile-buy-bar') : buyerPage.getByTestId('detail-price')
    await expect(price).toContainText('1.19 ETH')
    // Prova de que o preço novo chega pelo socket: o REST do detalhe passa a falhar nessa aba.
    await buyer.setScenario({ faults: [{ route: 'GET /api/nfts/nft-01', kind: 'http500', times: -1 }] })

    await row.locator('[data-edition-id="nft-01-ed-3"]').getByRole('button', { name: /Editar/ }).click()
    const dialog = page.getByTestId('edition-dialog')
    await expect(dialog.getByRole('heading', { name: 'Editar edição 1/50' })).toBeVisible()
    // Validação no navegador antes de ir para a API.
    await dialog.getByLabel('Preço (ETH)').fill('0,99')
    await dialog.getByTestId('edition-save').click()
    await expect(dialog.getByTestId('field-error')).toContainText('ponto')
    await dialog.getByLabel('Preço (ETH)').fill('0.99')
    await dialog.getByTestId('edition-save').click()
    await expect(dialog).toBeHidden()
    await expect(row.locator('[data-edition-id="nft-01-ed-3"]').getByTestId('admin-edition-price')).toHaveText('0.99 ETH')
    await expect(page.getByTestId('live-polite')).toContainText('salva')

    await expect(price).toContainText('0.99 ETH')
    await expect(buyerPage.getByText('Não foi possível carregar')).toHaveCount(0)
    await buyerPage.close()
  })

  test('conflito de versão: o NFT muda com o diálogo aberto e a API recusa a gravação antiga', async ({ app, page }) => {
    await app.login('admin')
    await app.goto('/admin?q=nft-01')
    const row = await openEditions(page, 'nft-01')
    await row.locator('[data-edition-id="nft-01-ed-2"]').getByRole('button', { name: /Editar/ }).click()
    const dialog = page.getByTestId('edition-dialog')
    await dialog.getByLabel('Disponível para venda').fill('3')

    // Outra aba (ou uma compra) grava antes: o evento chega e o diálogo avisa.
    await app.mock('changePrice', 'nft-01', 'nft-01-ed-2', '2.10')
    await expect(dialog.getByTestId('edition-changed')).toBeVisible()
    await dialog.getByTestId('edition-save').click()
    await expect(dialog.getByTestId('edition-conflict')).toContainText('2.10 ETH')
    expect((await app.mock('getNft', 'nft-01'))?.editions[1]).toMatchObject({ price: '2.1', available: 4 })

    await dialog.getByRole('button', { name: 'Usar os valores atuais' }).click()
    await expect(dialog.getByLabel('Preço (ETH)')).toHaveValue('2.1')
    await expect(dialog.getByLabel('Disponível para venda')).toHaveValue('4')
    await dialog.getByLabel('Disponível para venda').fill('3')
    await dialog.getByTestId('edition-save').click()
    await expect(dialog).toBeHidden()
    expect((await app.mock('getNft', 'nft-01'))?.editions[1]).toMatchObject({ price: '2.1', available: 3 })
  })

  test('destaque: liga na hora (otimista) e a vitrine da API passa a incluir o NFT', async ({ app, page }) => {
    await app.login('admin')
    await app.goto('/admin?q=nft-04')
    const toggle = page.locator('[data-nft-id="nft-04"]').getByTestId('featured-toggle')
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('live-polite')).toContainText('destaques')
    const featured = await page.evaluate(async () => (await (await fetch('/api/nfts/featured')).json()).items.map((n: { id: string }) => n.id))
    expect(featured).toContain('nft-04')
  })

  test('cupom criado no painel vale no carrinho e deixa de valer ao ser desativado', async ({ app, page }) => {
    await app.login('admin')
    await app.goto('/admin?aba=cupons')
    await expect(page.getByRole('tab', { name: 'Cupons' })).toHaveAttribute('aria-selected', 'true')
    const form = page.getByRole('region', { name: 'Novo cupom' })

    // Validação: valor fora da faixa e código repetido (este vem da API: 409 no campo).
    await form.getByLabel('Código').fill('kurio10')
    await form.getByLabel('Desconto (%)').fill('150')
    await form.getByRole('button', { name: 'Criar cupom' }).click()
    await expect(form.getByTestId('field-error')).toHaveText(/Percentual entre/)
    await form.getByLabel('Desconto (%)').fill('15')
    await form.getByRole('button', { name: 'Criar cupom' }).click()
    await expect(form.getByTestId('field-error')).toHaveText(/Já existe um cupom/)

    await form.getByLabel('Código').fill('verao15')
    await form.getByRole('button', { name: 'Criar cupom' }).click()
    const created = page.locator('[data-testid="admin-coupon"][data-code="VERAO15"]')
    await expect(created).toContainText('15%')
    await expect(created).toContainText('Ativo')

    await app.addToCart('nft-02', { edition: 'nft-02-ed-2' })
    await page.getByLabel('Código promocional').fill('verao15')
    await page.getByRole('button', { name: 'Aplicar' }).click()
    await expect(page.getByTestId('applied-coupon')).toContainText('VERAO15')
    // 0.95 − 15% (0.1425) + taxa 0.016 = 0.8235
    await expect(page.getByTestId('summary-discount')).toHaveText('(-) 0.1425 ETH')
    await expect(page.getByTestId('summary-total')).toHaveText('0.8235 ETH')

    await app.goto('/admin?aba=cupons')
    await page.locator('[data-testid="admin-coupon"][data-code="VERAO15"]').getByRole('button', { name: /Desativar/ }).click()
    await page.getByTestId('confirm-deactivate').click()
    await expect(page.locator('[data-testid="admin-coupon"][data-code="VERAO15"]')).toContainText('Desativado')

    await app.goto('/carrinho')
    await expect(page.getByTestId('applied-coupon')).toHaveCount(0)
    await expect(page.getByTestId('summary-total')).toHaveText('0.966 ETH')
    await page.getByLabel('Código promocional').fill('VERAO15')
    await page.getByRole('button', { name: 'Aplicar' }).click()
    await expect(page.getByTestId('coupon-error')).toHaveText('Este cupom foi desativado')
  })
})
