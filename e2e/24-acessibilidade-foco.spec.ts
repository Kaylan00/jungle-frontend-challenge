/**
 * Cenário 24 — foco do teclado nos fluxos com conta (carrinho, detalhe, pagamento) e axe nas telas logadas.
 * Botões que esperam a API ficam inativos sem perder o foco (aria-disabled); diálogos devolvem o foco a quem
 * os abriu; o elemento focado nunca fica escondido atrás das barras fixas do celular.
 */
import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

const activeLabel = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName)

test.describe('Foco do teclado nos fluxos com conta', () => {
  test.beforeEach(async ({ app }) => {
    await app.login('ana')
  })

  test('"+" da quantidade no carrinho: o foco continua no botão enquanto a API responde', async ({ app, page }) => {
    await app.addToCart('nft-01', { edition: 'nft-01-ed-3' })
    await app.setScenario({ latency: 'slow' })
    const plus = page.getByRole('button', { name: 'Aumentar quantidade de Emerald Ape #042' }).filter({ visible: true })
    await plus.focus()
    await page.keyboard.press('Enter')
    await expect(plus).toHaveAttribute('aria-disabled', 'true')
    expect(await activeLabel(page)).toBe('Aumentar quantidade de Emerald Ape #042')
    await expect(app.cartItems().first().getByTestId('quantity-value')).toHaveText('2')
    await expect(plus).toBeFocused()
  })

  test('"Adicionar ao carrinho" no detalhe: o foco continua no botão', async ({ app, page }) => {
    await app.goto('/nft/nft-01?edicao=nft-01-ed-3')
    await app.setScenario({ latency: 'slow' })
    const name = app.isMobile ? 'Adicionar ao carrinho' : 'Adicionar ao carrinho e continuar navegando'
    const add = page.getByRole('button', { name, exact: true }).filter({ visible: true })
    await add.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByText(/adicionado ao carrinho/).first()).toBeVisible()
    await expect(add).toBeFocused()
  })

  test('pagamento: "Conectar carteira" mantém o foco e Esc na revisão devolve o foco ao botão que a abriu', async ({ app, page }) => {
    await app.addToCart('nft-01', { edition: 'nft-01-ed-3' })
    await page.getByTestId('checkout-button').click()
    await expect(page).toHaveURL(/\/pagamento$/)

    const connect = page.getByTestId('connect-wallet')
    await connect.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('wallet-connection')).toHaveAttribute('data-status', 'connected')
    // O botão sai da tela: o foco vai para o status da conexão, não para o início da página.
    await expect(page.getByTestId('wallet-connected-status')).toBeFocused()

    const reviewButton = page.getByTestId('review-button')
    await reviewButton.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByTestId('review-dialog')
    await expect(dialog).toBeVisible()
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(reviewButton).toBeFocused()
  })
})

test('celular: o elemento focado por Tab nunca fica atrás da barra de navegação inferior', async ({ app, page }) => {
  test.skip(!app.isMobile, 'A barra inferior existe só no celular')
  await app.goto('/')
  await expect(page.getByTestId('catalog-grid').getByTestId('nft-card')).toHaveCount(9)
  const hidden: string[] = []
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab')
    const r = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      if (!el || el === document.body || el.closest('nav[aria-label="Navegação inferior"]')) return null
      const box = el.getBoundingClientRect()
      const bar = document.querySelector('nav[aria-label="Navegação inferior"]')?.getBoundingClientRect()
      return { name: el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30) ?? el.tagName, bottom: box.bottom, top: box.top, barTop: bar?.top ?? innerHeight }
    })
    // Encoberto por completo: o topo do elemento já está abaixo do topo da barra.
    if (r && r.top >= r.barTop) hidden.push(`${r.name} (topo ${Math.round(r.top)} ≥ barra ${Math.round(r.barTop)})`)
  }
  expect(hidden).toEqual([])
})

test('tela muito baixa (zoom de 400%): a barra de compra do detalhe deixa de ser fixa', async ({ app, page }) => {
  test.skip(app.isMobile, 'Fixa a própria janela de 320×256')
  await page.setViewportSize({ width: 320, height: 256 })
  await app.goto('/nft/nft-01')
  const bar = page.getByTestId('mobile-buy-bar')
  await expect(bar).toHaveCSS('position', 'static')
})

test('axe (WCAG A/AA, sem violações sérias): carrinho, pagamento com a revisão aberta, perfil e cadastro', async ({ app, page }) => {
  const check = async (label: string) => {
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    expect(serious.map((v) => `${label}: ${v.id} (${v.nodes.length})`)).toEqual([])
  }
  await app.goto('/cadastro')
  await check('/cadastro')
  await app.login('ana')
  await app.addToCart('nft-01', { edition: 'nft-01-ed-3' })
  await check('/carrinho')
  await page.getByTestId('checkout-button').click()
  await expect(page).toHaveURL(/\/pagamento$/)
  await check('/pagamento')
  await page.getByTestId('connect-wallet').click()
  await expect(page.getByTestId('wallet-connection')).toHaveAttribute('data-status', 'connected')
  await page.getByTestId('review-button').click()
  await expect(page.getByTestId('review-dialog')).toBeVisible()
  await check('/pagamento (revisão aberta)')
  await page.keyboard.press('Escape')
  await app.goto('/perfil')
  await check('/perfil')
})
