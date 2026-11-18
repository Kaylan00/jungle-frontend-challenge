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

  // Um teste por largura (rodam em paralelo, cada um com folga própria) em vez de um só com 32 navegações,
  // que passava de 45 s com 4 workers. Mesma cobertura: 8 rotas x 4 larguras, cada rota num passo nomeado.
  // 640 px ≈ 1280 px com zoom de 200% (WCAG 1.4.10, reflow).
  const OVERFLOW_ROUTES = ['/', '/nft/nft-01', '/carrinho', '/pagamento', '/perfil', '/perfil/carteiras', '/perfil/favoritos', '/login']
  for (const width of [390, 640, 768, 1440]) {
    test(`sem overflow horizontal em ${width} px${width === 640 ? ' (1280 px com zoom de 200%)' : ''}`, async ({ app, page }) => {
      test.skip(app.isMobile, 'Cada teste já fixa a largura (390 px incluso)')
      test.setTimeout(60_000)
      await app.login('ana')
      // Carrinho com item (para /carrinho e /pagamento terem conteúdo) pelo fluxo de compra do desktop.
      await app.addToCart('nft-01', { edition: 'nft-01-ed-3' })
      await page.setViewportSize({ width, height: 900 })
      for (const path of OVERFLOW_ROUTES) {
        await test.step(path, async () => {
          await app.goto(path)
          await page.waitForLoadState('networkidle')
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
          expect(overflow, `${path} em ${width}px`).toBeLessThanOrEqual(0)
        })
      }
    })
  }

  test('nome de usuário longo não empurra o cabeçalho em 768 px', async ({ app, page }) => {
    test.skip(app.isMobile, 'Botão da conta só existe a partir de 768 px')
    await page.setViewportSize({ width: 768, height: 900 })
    await app.login('admin') // kurio_admin: o nome mais longo da seed
    for (const path of ['/', '/nft/nft-01', '/carrinho']) {
      await app.goto(path)
      await expect(page.getByRole('button', { name: /, menu da conta$/ })).toBeVisible()
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow, `${path} em 768px`).toBeLessThanOrEqual(0)
    }
  })
})

