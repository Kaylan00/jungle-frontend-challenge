/**
 * Cenário 20 — Kurio Admin como sistema à parte: entrada própria (conta comum barrada pelo 403 da API, sem
 * deixar sessão aberta), casca (trilho com aria-current, sair), busca global por atalho e pedidos de todas as
 * contas com o status ao vivo.
 */
import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

/**
 * "Outro cliente" compra pela API, na mesma aba do painel (o servidor simulado é o mesmo): login da Ana só
 * por fetch (a sessão do painel continua a do admin), carrinho, carteira conectada, cotação e pedido.
 */
async function buyAsAna(page: Page, nftId: string, editionId: string) {
  return page.evaluate(
    async ({ nftId, editionId }) => {
      const call = async (method: string, url: string, token: string | null, body?: unknown, headers: Record<string, string> = {}) => {
        const r = await fetch(`/api${url}`, {
          method,
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
          body: body === undefined ? undefined : JSON.stringify(body),
        })
        const json = r.status === 204 ? null : await r.json()
        if (!r.ok) throw new Error(`${method} ${url}: ${r.status} ${JSON.stringify(json)}`)
        return json
      }
      const { token } = await call('POST', '/auth/login', null, { email: 'ana@kurio.test', password: 'Selva2026!' })
      await call('POST', '/cart/items', token, { nftId, editionId, quantity: 1 })
      await call('POST', '/wallets/wal-ana-1/connect', token, { network: 'ethereum' })
      const quote = await call('POST', '/quotes', token, { network: 'ethereum', couponCode: null })
      const order = await call(
        'POST',
        '/orders',
        token,
        {
          quoteId: quote.id,
          fingerprint: quote.fingerprint,
          walletId: 'wal-ana-1',
          network: 'ethereum',
          provider: 'metamask',
          collector: {
            displayName: 'Ana Colecionadora',
            username: 'ana_nft',
            profileName: 'ana.kurio',
            email: 'ana@kurio.test',
            ensName: 'ana-kurio',
            referralCode: 'KURIO-ANA',
            note: '',
          },
        },
        { 'Idempotency-Key': crypto.randomUUID() },
      )
      return order.number as string
    },
    { nftId, editionId },
  )
}

test.describe('Kurio Admin: entrada e casca', () => {
  test('conta comum é barrada pelo 403 da API na entrada do painel e não fica com sessão aberta', async ({ app, page }) => {
    await app.panelLogin('ana')
    const forbidden = page.getByTestId('panel-login-forbidden')
    await expect(forbidden).toContainText('Sem permissão (403)')
    await expect(forbidden).toContainText('Esta área é só para administradores da Kurio.')
    await expect(page).toHaveURL(/\/admin\/entrar$/)
    // A sessão criada pelo login foi encerrada: nada salvo neste navegador e nenhuma sessão viva no servidor.
    expect(await page.evaluate(() => localStorage.getItem('jungle.session.token'))).toBeNull()
    await expect(page.getByLabel('E-mail')).toHaveValue('ana@kurio.test')

    // Senha errada: a mensagem vem da API (401) e o formulário continua preenchido.
    await page.getByLabel('E-mail').fill('admin@kurio.test')
    await page.getByLabel('Senha', { exact: true }).fill('errada123')
    await page.getByRole('button', { name: 'Entrar', exact: true }).click()
    await expect(page.getByTestId('panel-login-error')).toBeVisible()
    await expect(page.getByTestId('panel-login-forbidden')).toHaveCount(0)
  })

  test('login do painel leva ao endereço pedido; trilho marca a área; sair volta para a entrada', async ({ app, page }) => {
    await app.goto('/admin/pedidos')
    await expect(page).toHaveURL(/\/admin\/entrar\?redirect=%2Fadmin%2Fpedidos/)
    await app.panelLogin('admin', page.url().replace(/^https?:\/\/[^/]+/, ''))
    await expect(page).toHaveURL(/\/admin\/pedidos$/)
    await expect(page.getByRole('heading', { name: 'Pedidos', level: 1 })).toBeVisible()
    await expect(page.getByRole('main')).toBeVisible()
    await expect(page.getByRole('banner')).toHaveCount(0)

    if (app.isMobile) {
      // No celular o trilho é um menu que abre por cima, com foco preso e Esc para fechar.
      await page.getByRole('button', { name: 'Menu', exact: true }).click()
      const menu = page.getByTestId('panel-mobile-menu')
      await expect(menu.getByRole('link', { name: /^Pedidos/ })).toHaveAttribute('aria-current', 'page')
      await page.keyboard.press('Escape')
      await expect(menu).toBeHidden()
    } else {
      const nav = page.getByRole('navigation', { name: 'Áreas do painel' })
      await expect(nav.getByRole('link', { name: /^Pedidos/ })).toHaveAttribute('aria-current', 'page')
      await expect(nav.getByRole('link', { name: 'Visão geral' })).not.toHaveAttribute('aria-current', 'page')
      // Recolher o trilho mantém os nomes para leitor de tela e a escolha vale depois de recarregar.
      await page.getByRole('button', { name: 'Recolher o menu' }).click()
      await expect(page.getByRole('button', { name: 'Abrir o menu' })).toHaveAttribute('aria-expanded', 'false')
      await page.reload()
      await expect(page.getByRole('button', { name: 'Abrir o menu' })).toBeVisible()
      await expect(nav.getByRole('link', { name: 'Usuários' })).toBeVisible()
      await page.getByRole('button', { name: 'Abrir o menu' }).click()
    }

    await app.panelNav('Usuários')
    await expect(page).toHaveURL(/\/admin\/usuarios$/)
    const users = page.getByTestId('admin-user')
    await expect(users).toHaveCount(3)
    // Somente leitura e sem dado sensível: e-mail mascarado, nenhum endereço completo.
    await expect(page.locator('[data-username="ana_nft"]')).toContainText('a***@kurio.test')
    await expect(page.getByTestId('admin-user-list')).not.toContainText('ana@kurio.test')

    if (app.isMobile) await page.getByRole('button', { name: 'Menu', exact: true }).click()
    await page.getByRole('button', { name: 'Sair do painel' }).click()
    await expect(page).toHaveURL(/\/admin\/entrar\?motivo=saiu$/)
    await expect(page.getByTestId('panel-login-notice')).toContainText('Você saiu do painel')
    await app.goto('/admin')
    await expect(page).toHaveURL(/\/admin\/entrar\?redirect=%2Fadmin/)
  })

  test('busca global (Ctrl+K / Ctrl+F) leva a áreas, NFTs e cupons pelo nome, só com teclado', async ({ app, page }) => {
    await app.panelLogin('admin')

    // Área pelo nome (sem acento também vale) e Enter.
    let input = await app.openPanelSearch()
    await input.fill('usuarios')
    await expect(page.getByRole('option', { name: /Usuários/ })).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/admin\/usuarios$/)
    await expect(page.getByRole('heading', { name: 'Usuários', level: 1 })).toBeVisible()

    // NFT pelo nome: vem da API; setas escolhem; abre a seção NFTs com as edições dele à mostra.
    if (app.isMobile) input = await app.openPanelSearch()
    else {
      await page.keyboard.press('Control+F')
      input = page.getByRole('combobox', { name: 'Buscar no painel' })
      await expect(input).toBeFocused()
    }
    await input.fill('emerald ape')
    const options = page.getByTestId('command-palette').getByRole('option')
    await expect(options.filter({ hasText: 'Emerald Ape #042' })).toBeVisible()
    await expect(options.filter({ hasText: 'Emerald Ape #017' })).toBeVisible()
    await expect(options.first()).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('ArrowDown')
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true')
    await expect(input).toHaveAttribute('aria-activedescendant', (await options.nth(1).getAttribute('id'))!)
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/admin\/nfts\?q=nft-01&abrir=nft-01$/)
    const row = page.locator('[data-testid="admin-nft"][data-nft-id="nft-01"]')
    await expect(row.getByRole('button', { name: /^Edições/ })).toHaveAttribute('aria-expanded', 'true')
    await expect(row.getByTestId('admin-edition')).toHaveCount(4)

    // Cupom pelo código: leva à seção Cupons com o cupom marcado.
    input = await app.openPanelSearch()
    await input.fill('kurio10')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/admin\/cupons\?codigo=KURIO10$/)
    await expect(page.locator('[data-testid="admin-coupon"][data-code="KURIO10"]')).toHaveAttribute('aria-current', 'true')

    // Esc fecha e devolve o foco; nada encontrado tem resposta clara.
    input = await app.openPanelSearch()
    await input.fill('zzzz-nada')
    await expect(page.getByTestId('command-palette')).toContainText('Nada com “zzzz-nada”')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('command-palette')).toBeHidden()
  })

  test('acessibilidade (axe, WCAG A/AA): entrada, as cinco seções, a busca e o menu do celular', async ({ app, page }) => {
    const check = async (where: string) => {
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
      expect(results.violations.map((v) => `${where}: ${v.id} (${v.nodes.length})`)).toEqual([])
    }
    await app.goto('/admin/entrar')
    await check('entrada')
    await app.panelLogin('admin')
    await buyAsAna(page, 'nft-02', 'nft-02-ed-2')
    await expect(page.getByTestId('activity-item').first()).toBeVisible()
    await check('visão geral')
    for (const [path, ready] of [
      ['/admin/nfts?q=nft-01&abrir=nft-01', 'admin-edition'],
      ['/admin/cupons', 'admin-coupon'],
      ['/admin/pedidos', 'admin-order'],
      ['/admin/usuarios', 'admin-user'],
    ] as const) {
      await app.goto(path)
      await expect(page.getByTestId(ready).first()).toBeVisible()
      await check(path)
    }
    const input = await app.openPanelSearch()
    await input.fill('emerald')
    await expect(page.getByTestId('palette-option').first()).toBeVisible()
    await check('busca')
    await page.keyboard.press('Escape')
    if (app.isMobile) {
      await page.getByRole('button', { name: 'Menu', exact: true }).click()
      await expect(page.getByTestId('panel-mobile-menu')).toBeVisible()
      await check('menu do celular')
    }
  })

  test('pedidos ao vivo: a compra de outra conta aparece no painel e muda de status sem recarregar', async ({ app, page }) => {
    await app.panelLogin('admin')
    // Pagamento leva 2,5 s: dá para ver o pedido pendente antes de ele confirmar sozinho.
    await app.setScenario({ paymentDelayMs: 2500 })
    await app.realtimeConnected()
    await expect(page.getByTestId('kpi-pending').getByTestId('kpi-value')).toHaveText('0')
    await expect(page.getByText('Nada aconteceu ainda')).toBeVisible()
    // Prova de que o feed chega pelo socket: depois da primeira leitura, o REST do feed passa a falhar.
    await app.setScenario({ faults: [{ route: 'GET /api/admin/activity', kind: 'http500', times: -1 }] })

    const number = await buyAsAna(page, 'nft-02', 'nft-02-ed-2')
    const feed = page.getByTestId('activity-feed')
    await expect(feed.getByTestId('activity-item').first()).toContainText(`Pedido ${number} recebido`)
    await expect(feed.getByTestId('activity-item').first()).toContainText('ana_nft · 1 item')
    await expect(page.getByTestId('kpi-pending').getByTestId('kpi-value')).toHaveText('1')
    await expect(feed.getByTestId('activity-item').first()).toContainText(`Pedido ${number} confirmado`)
    await expect(page.getByTestId('kpi-confirmed').getByTestId('kpi-value')).toHaveText('1')
    await expect(page.getByTestId('kpi-revenue').getByTestId('kpi-value')).toHaveText('0.966 ETH')

    // Lista de pedidos: a próxima compra entra como "Processando" e vira "Confirmado" na mesma tela.
    await app.setScenario({ faults: [] })
    await app.panelNav(/^Pedidos/)
    const first = page.locator(`[data-testid="admin-order"][data-order-number="${number}"]`)
    await expect(first.getByTestId('order-status')).toHaveAttribute('data-status', 'confirmed')
    const second = await buyAsAna(page, 'nft-05', 'nft-05-ed-2')
    const row = page.locator(`[data-testid="admin-order"][data-order-number="${second}"]`)
    await expect(row.getByTestId('order-status')).toHaveAttribute('data-status', 'pending')
    await expect(row).toContainText('@ana_nft')
    await expect(row.getByTestId('order-status')).toHaveAttribute('data-status', 'confirmed')
    await expect(page.getByRole('navigation', { name: 'Filtrar pedidos por status' }).getByRole('link', { name: /Confirmados/ })).toContainText('2')
  })

  test('tema do painel: claro escolhido no trilho vale depois de recarregar, passa no axe e não muda a loja', async ({ app, page }) => {
    const check = async (where: string) => {
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
      expect(results.violations.map((v) => `${where} (claro): ${v.id} (${v.nodes.length})`)).toEqual([])
    }
    const html = page.locator('html')
    const themeGroup = () => {
      // No celular o seletor está no menu que abre por cima; no desktop, no rodapé do trilho.
      const scope = app.isMobile ? page.getByTestId('panel-mobile-menu') : page.getByRole('complementary', { name: 'Menu do painel' })
      return scope.getByRole('radiogroup', { name: 'Tema do painel' })
    }

    await app.panelLogin('admin')
    await expect(html).toHaveAttribute('data-kp-tema', 'escuro')
    if (app.isMobile) await page.getByRole('button', { name: 'Menu', exact: true }).click()
    await expect(themeGroup().getByRole('radio', { name: 'Escuro' })).toHaveAttribute('aria-checked', 'true')
    await themeGroup().getByRole('radio', { name: 'Claro' }).click()
    await expect(html).toHaveAttribute('data-kp-tema', 'claro')
    await expect(themeGroup().getByRole('radio', { name: 'Claro' })).toHaveAttribute('aria-checked', 'true')
    // Teclado (padrão de grupo de rádios): a seta marca a próxima opção e leva o foco junto.
    await page.keyboard.press('ArrowRight')
    await expect(themeGroup().getByRole('radio', { name: 'Igual ao sistema' })).toBeFocused()
    await expect(themeGroup().getByRole('radio', { name: 'Igual ao sistema' })).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('ArrowLeft')
    await expect(themeGroup().getByRole('radio', { name: 'Claro' })).toHaveAttribute('aria-checked', 'true')
    if (app.isMobile) {
      await check('menu do celular')
      // O primeiro Esc fecha a dica da opção focada; o segundo, o menu.
      await page.keyboard.press('Escape')
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('panel-mobile-menu')).toBeHidden()
    }
    await expect(page.locator('main#conteudo')).toHaveCSS('background-color', 'rgb(255, 252, 247)')

    // Recarregar: continua claro (escolha gravada) e já nasce claro.
    await page.reload()
    await expect(page.getByTestId('kpi-revenue').getByTestId('kpi-value')).toBeVisible()
    await expect(html).toHaveAttribute('data-kp-tema', 'claro')
    expect(await page.evaluate(() => localStorage.getItem('kurio.admin.tema'))).toBe('claro')
    await check('visão geral')
    for (const [path, ready] of [
      ['/admin/nfts?q=nft-01&abrir=nft-01', 'admin-edition'],
      ['/admin/cupons', 'admin-coupon'],
      ['/admin/usuarios', 'admin-user'],
    ] as const) {
      await app.goto(path)
      await expect(page.getByTestId(ready).first()).toBeVisible()
      await check(path)
    }
    await app.goto('/admin/pedidos')
    await expect(page.getByRole('navigation', { name: 'Filtrar pedidos por status' }).getByRole('link', { name: /^Todos/ })).toContainText('0')
    await check('/admin/pedidos')
    // Diálogo (renderizado fora da casca) também no claro.
    await app.goto('/admin/cupons')
    await page.locator('[data-testid="admin-coupon"]').filter({ has: page.getByRole('button', { name: /Desativar/ }) }).first().getByRole('button', { name: /Desativar/ }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCSS('background-color', 'rgb(255, 252, 247)')
    await check('diálogo')
    await page.keyboard.press('Escape')
    const input = await app.openPanelSearch()
    await input.fill('tema')
    await expect(page.getByRole('option', { name: /Tema: claro/ })).toContainText('Em uso agora')
    await check('busca')
    await page.keyboard.press('Escape')

    // A loja não muda: sem o atributo do painel, fundo escuro de sempre.
    await app.goto('/')
    await expect(html).not.toHaveAttribute('data-kp-tema', /.*/)
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(20, 13, 10)')
    await expect(page.locator('main#conteudo')).toBeVisible()

    // De volta ao painel: ainda claro. A busca global também troca o tema ("Tema: escuro").
    await app.goto('/admin')
    await expect(html).toHaveAttribute('data-kp-tema', 'claro')
    const search = await app.openPanelSearch()
    await search.fill('tema escuro')
    await page.keyboard.press('Enter')
    await expect(html).toHaveAttribute('data-kp-tema', 'escuro')
    expect(await page.evaluate(() => localStorage.getItem('kurio.admin.tema'))).toBe('escuro')
  })
})
