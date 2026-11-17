/** Cenário 11 — navegação por teclado, foco em diálogos e validação de formulários (+ axe). */
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './fixtures'

test.describe('Teclado e acessibilidade', () => {
  test('link de pular conteúdo, foco preso no diálogo de login e Esc fecha', async ({ app, page }) => {
    test.skip(app.isMobile, 'Teclado físico: desktop')
    await app.goto('/')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Pular para o conteúdo' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/#conteudo/)

    // Abre o login pelo teclado
    await page.getByRole('link', { name: 'Entrar' }).focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel('E-mail')).toBeFocused()

    // Foco não escapa do diálogo
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab')
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
    }

    // Enviar vazio: erros ligados aos campos
    await dialog.getByLabel('E-mail').focus()
    await page.keyboard.press('Enter')
    const email = dialog.getByLabel('E-mail')
    await expect(email).toHaveAttribute('aria-invalid', 'true')
    const describedBy = await email.getAttribute('aria-describedby')
    await expect(page.locator(`#${describedBy}`)).toHaveText(/Informe um e-mail válido/)

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(page).not.toHaveURL(/\/login/)
  })

  test('catálogo operável só com teclado (filtro + abrir NFT)', async ({ app, page }) => {
    test.skip(app.isMobile, 'Teclado físico: desktop')
    await app.goto('/')
    const musica = page.getByRole('checkbox', { name: /Música/ }).first()
    await musica.focus()
    await page.keyboard.press('Space')
    await expect(page).toHaveURL(/category=/)
    const firstCard = page.getByTestId('catalog-grid').getByTestId('nft-card').first().getByRole('link')
    await firstCard.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/nft\//)
    await expect(page.locator('main#conteudo')).toBeFocused()
  })

  test('sem violações graves de acessibilidade (axe) no início, detalhe e login', async ({ app, page }) => {
    for (const path of ['/', '/nft/nft-01', '/login']) {
      await app.goto(path)
      await page.waitForLoadState('networkidle')
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
      const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
      expect(serious.map((v) => `${path}: ${v.id} (${v.nodes.length})`)).toEqual([])
    }
  })

  test('sem overflow horizontal em 390, 768 e 1440 px nem com zoom de 200%', async ({ app, page }) => {
    test.skip(app.isMobile, 'O próprio teste percorre as larguras')
    await app.login('ana')
    await app.addToCart('nft-01', { edition: 'nft-01-ed-3' })
    const routes = ['/', '/nft/nft-01', '/carrinho', '/pagamento', '/perfil', '/perfil/carteiras', '/perfil/favoritos', '/login']
    // 640 px ≈ 1280 px com zoom de 200% (WCAG 1.4.10, reflow)
    for (const width of [390, 640, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      for (const path of routes) {
        await app.goto(path)
        await page.waitForLoadState('networkidle')
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(overflow, `${path} em ${width}px`).toBeLessThanOrEqual(0)
      }
    }
  })
})

