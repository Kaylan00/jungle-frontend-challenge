/** Cenário 13 — recuperação de senha: pedido por e-mail (simulado), link, senha nova, login; links inválidos e falhas. */
import AxeBuilder from '@axe-core/playwright'
import { expect, test, USERS } from './fixtures'

const NEW_PASSWORD = 'Floresta2027'

test.describe('Recuperar senha', () => {
  test('Ana pede o link, abre o e-mail simulado, troca a senha e entra com a nova', async ({ app, page }) => {
    await app.goto('/login')
    await page.getByRole('dialog').getByRole('link', { name: 'Esqueceu a senha?' }).click()
    await expect(page).toHaveURL(/\/recuperar-senha/)

    const forgot = page.getByRole('dialog', { name: 'Recuperar senha' })
    const email = forgot.getByLabel('E-mail da conta')
    // Validação no cliente, com o erro ligado ao campo
    await forgot.getByRole('button', { name: 'Enviar link' }).click()
    await expect(email).toHaveAttribute('aria-invalid', 'true')
    await expect(page.locator(`#${await email.getAttribute('aria-describedby')}`)).toHaveText(/Informe um e-mail válido/)

    await email.fill(USERS.ana.email)
    await forgot.getByRole('button', { name: 'Enviar link' }).click()
    await expect(forgot.getByRole('heading', { name: 'Confira seu e-mail' })).toBeFocused()
    await expect(forgot.getByText(/Se houver uma conta com esse e-mail, enviamos um link/)).toBeVisible()

    // O "servidor de e-mail" é simulado: a mensagem fica na caixa de saída do mock.
    const mail = await app.mock('lastEmail', USERS.ana.email)
    expect(mail?.to).toBe(USERS.ana.email)
    expect(mail?.path).toMatch(/^\/redefinir-senha\?token=rst_/)
    await expect(forgot.getByTestId('simulated-inbox')).toContainText('nenhum e-mail de verdade foi enviado')
    await forgot.getByRole('link', { name: 'Abrir e-mail simulado' }).click()
    await expect(page).toHaveURL(/\/redefinir-senha\?token=rst_/)

    const reset = page.getByRole('dialog', { name: 'Criar nova senha' })
    await expect(reset.getByTestId('reset-account')).toContainText('a***@kurio.test')
    const password = reset.getByLabel('Nova senha', { exact: true })
    const confirm = reset.getByLabel('Confirmar nova senha')
    // Mesmas regras de senha do cadastro
    await password.fill('curta')
    await confirm.fill('outra')
    await reset.getByRole('button', { name: 'Salvar nova senha' }).click()
    await expect(password).toHaveAttribute('aria-invalid', 'true')
    await expect(page.locator(`#${(await password.getAttribute('aria-describedby'))?.split(' ')[0]}`)).toHaveText(/pelo menos 8 caracteres/)
    await expect(reset.getByText('As senhas não conferem')).toBeVisible()

    await password.fill(NEW_PASSWORD)
    await confirm.fill(NEW_PASSWORD)
    await reset.getByRole('button', { name: 'Salvar nova senha' }).click()
    await expect(page).toHaveURL(/\/login\?.*reason=password-reset/)
    await expect(page.getByTestId('password-reset-notice')).toHaveText(/Senha alterada/)

    // A senha antiga não entra mais; a nova entra.
    const login = page.getByRole('dialog')
    await login.getByLabel('E-mail').fill(USERS.ana.email)
    await login.getByLabel('Senha', { exact: true }).fill(USERS.ana.password)
    await login.getByRole('button', { name: 'Entrar', exact: true }).click()
    await expect(login.getByTestId('form-error')).toHaveText('E-mail ou senha incorretos')
    await login.getByLabel('Senha', { exact: true }).fill(NEW_PASSWORD)
    await login.getByRole('button', { name: 'Entrar', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeHidden()

    // O mesmo link não serve duas vezes (410).
    await app.goto(mail!.path)
    await expect(page.getByTestId('reset-link-error')).toContainText('já foi usado')
  })

  test('token inválido ou expirado: mensagem e link para pedir de novo; resposta neutra para e-mail desconhecido', async ({ app, page }) => {
    await app.goto('/redefinir-senha?token=rst_nao_existe')
    const reset = page.getByRole('dialog', { name: 'Criar nova senha' })
    await expect(reset.getByTestId('reset-link-error')).toContainText('não é válido')
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([])
    await expect(reset.getByLabel('Nova senha', { exact: true })).toHaveCount(0)
    await reset.getByRole('link', { name: 'Pedir um novo link' }).click()
    await expect(page).toHaveURL(/\/recuperar-senha/)

    // E-mail sem conta: a API responde igual (não revela quem está cadastrado) e nada é "enviado".
    const forgot = page.getByRole('dialog', { name: 'Recuperar senha' })
    await forgot.getByLabel('E-mail da conta').fill('ninguem@kurio.test')
    await forgot.getByRole('button', { name: 'Enviar link' }).click()
    await expect(forgot.getByText(/Se houver uma conta com esse e-mail, enviamos um link/)).toBeVisible()
    expect(await app.mock('lastEmail', 'ninguem@kurio.test')).toBeNull()
    await expect(forgot.getByRole('link', { name: 'Abrir e-mail simulado' })).toHaveCount(0)

    // Link vencido (30 min) → 410
    await forgot.getByRole('button', { name: 'Pedir de novo' }).click()
    await expect(forgot.getByLabel('E-mail da conta')).toHaveValue('ninguem@kurio.test')
    await forgot.getByLabel('E-mail da conta').fill(USERS.bruno.email)
    await forgot.getByRole('button', { name: 'Enviar link' }).click()
    await expect(forgot.getByRole('link', { name: 'Abrir e-mail simulado' })).toBeVisible()
    await app.mock('expirePasswordResets')
    await forgot.getByRole('link', { name: 'Abrir e-mail simulado' }).click()
    await expect(page.getByTestId('reset-link-error')).toContainText('expirou')
  })

  test('falha de rede e erro 500: mensagem e "Tentar novamente" sem perder o que foi digitado', async ({ app, page }) => {
    await app.goto('/recuperar-senha')
    await app.setScenario({ faults: [{ route: 'POST /api/auth/password-reset', kind: 'network', times: 1 }] })
    const forgot = page.getByRole('dialog', { name: 'Recuperar senha' })
    await forgot.getByLabel('E-mail da conta').fill(USERS.ana.email)
    await forgot.getByRole('button', { name: 'Enviar link' }).click()
    await expect(forgot.getByTestId('form-error')).toContainText('Sem conexão')
    await forgot.getByRole('button', { name: 'Tentar novamente' }).click()
    await expect(forgot.getByRole('heading', { name: 'Confira seu e-mail' })).toBeVisible()

    await app.setScenario({ faults: [{ route: 'POST /api/auth/password-reset/confirm', kind: 'http500', times: 1 }] })
    await forgot.getByRole('link', { name: 'Abrir e-mail simulado' }).click()
    const reset = page.getByRole('dialog', { name: 'Criar nova senha' })
    await reset.getByLabel('Nova senha', { exact: true }).fill(NEW_PASSWORD)
    await reset.getByLabel('Confirmar nova senha').fill(NEW_PASSWORD)
    await reset.getByRole('button', { name: 'Salvar nova senha' }).click()
    await expect(reset.getByTestId('form-error')).toContainText('Sua senha não foi alterada')
    await reset.getByRole('button', { name: 'Tentar novamente' }).click()
    await expect(page.getByTestId('password-reset-notice')).toBeVisible()
  })

  test('foco inicial: no desktop vai para o e-mail; no celular nenhum campo (sem teclado) e o X fica sempre visível', async ({ app, page }) => {
    if (!app.isMobile) {
      await app.goto('/login')
      await expect(page.getByRole('dialog').getByLabel('E-mail')).toBeFocused()
      await app.goto('/recuperar-senha')
      await expect(page.getByRole('dialog').getByLabel('E-mail da conta')).toBeFocused()
      return
    }
    for (const path of ['/login', '/cadastro', '/recuperar-senha']) {
      await app.goto(path)
      const dialog = page.getByRole('dialog')
      // Foco preso na própria janela (leitor de tela anuncia o título), nenhum campo focado.
      await expect(dialog).toBeFocused()
      expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('INPUT')

      // Mesmo com o conteúdo rolado até o fim, o X continua no topo e com área de toque de 44px.
      // (Tela baixa, como com o teclado aberto: o conteúdo é maior que a tela e precisa rolar.)
      await page.setViewportSize({ width: 390, height: 520 })
      expect(await dialog.evaluate((el) => (el.scrollTo(0, el.scrollHeight), el.scrollTop))).toBeGreaterThan(50)
      const close = dialog.getByRole('button', { name: 'Fechar' })
      await expect(close).toBeInViewport()
      const box = await close.boundingBox()
      expect(box!.width).toBeGreaterThanOrEqual(44)
      expect(box!.height).toBeGreaterThanOrEqual(44)
      expect(box!.y).toBeLessThan(24)
      await close.click()
      await expect(page.getByRole('dialog')).toBeHidden()
    }
  })
})
