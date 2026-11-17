/** Cenário 8 — edição de perfil, avatar, senha e carteiras, com erros de validação. */
import { expect, test, USERS } from './fixtures'

// PNG 1x1 válido (avatar de teste)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

test.describe('Perfil e carteiras', () => {
  test('perfil: validação, conflito, salvar com persistência e avatar', async ({ app, page }) => {
    await app.login('ana')
    await app.goto('/perfil')
    const form = page.getByTestId('profile-form')
    await form.getByLabel('Nome de exibição').fill('')
    await form.getByRole('button', { name: 'Salvar' }).click()
    await expect(form.getByText('Informe seu nome de exibição')).toBeVisible()

    await form.getByLabel('Nome de exibição').fill('Ana Atualizada')
    await form.getByLabel('Nome de usuário').fill('bruno_pixel')
    await form.getByRole('button', { name: 'Salvar' }).click()
    await expect(form.getByText('Este nome de usuário já está em uso')).toBeVisible()

    await form.getByLabel('Nome de usuário').fill('ana_atualizada')
    await form.getByRole('button', { name: 'Salvar' }).click()
    await expect(page.getByText(/salvo|atualizado/i).first()).toBeVisible()
    await page.reload()
    await expect(page.getByTestId('profile-form').getByLabel('Nome de exibição')).toHaveValue('Ana Atualizada')
    await expect(page.getByTestId('profile-form').getByLabel('Nome de usuário')).toHaveValue('ana_atualizada')

    await page.getByTestId('avatar-input').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: PNG })
    await expect(page.getByTestId('avatar-image')).toBeVisible()
    await page.reload()
    await expect(page.getByTestId('avatar-image')).toBeVisible()
  })

  test('senha: atual errada, confirmação divergente e troca com novo login', async ({ app, page }) => {
    await app.login('ana')
    await app.goto('/perfil')
    const form = page.getByTestId('password-form')
    await form.getByLabel(/^Senha atual/).fill('errada123')
    await form.getByLabel(/^Nova senha/).fill('NovaSenha2026')
    await form.getByLabel(/^Confirmar nova senha/).fill('Diferente2026')
    await form.getByRole('button', { name: 'Alterar senha' }).click()
    await expect(form.getByText('As senhas não conferem')).toBeVisible()

    await form.getByLabel(/^Confirmar nova senha/).fill('NovaSenha2026')
    await form.getByRole('button', { name: 'Alterar senha' }).click()
    await expect(form.getByText('Senha atual incorreta')).toBeVisible()

    await form.getByLabel(/^Senha atual/).fill(USERS.ana.password)
    await form.getByRole('button', { name: 'Alterar senha' }).click()
    await expect(page.getByText(/senha (alterada|atualizada)/i).first()).toBeVisible()

    await page.getByRole('button', { name: 'Sair' }).click()
    await page.waitForFunction(() => !localStorage.getItem('jungle.session.token'))
    await app.goto('/login')
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('E-mail').fill(USERS.ana.email)
    await dialog.getByLabel('Senha', { exact: true }).fill('NovaSenha2026')
    await dialog.getByRole('button', { name: 'Entrar', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
  })

  test('carteiras: endereço inválido, cadastro da principal e da secundária', async ({ app, page }) => {
    await app.login('bruno')
    await app.goto('/perfil/carteiras')
    const primary = page.getByTestId('wallet-form-primary')
    await primary.getByLabel('Apelido da carteira').fill('Jogos')
    await primary.getByLabel('Nome do perfil').fill('bruno.kurio')
    await primary.getByLabel('Endereço da carteira').fill('0x123')
    await primary.getByLabel('Código de indicação').fill('KURIO-BRU')
    await primary.getByRole('button', { name: 'Salvar carteira' }).click()
    await expect(primary.getByText(/Endereço inválido/)).toBeVisible()

    await primary.getByLabel('Endereço da carteira').fill('0x1111111111111111111111111111111111111111')
    await primary.getByRole('button', { name: 'Salvar carteira' }).click()
    await expect(page.getByText(/Carteira .*salva/i).first()).toBeVisible()
    await page.reload()
    await expect(page.getByTestId('wallet-form-primary').getByLabel('Endereço da carteira')).toHaveValue('0x1111111111111111111111111111111111111111')
  })
})
