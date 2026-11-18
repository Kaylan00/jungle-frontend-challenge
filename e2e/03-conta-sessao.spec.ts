/** Cenário 3 — cadastro, login, expiração de sessão, logout e troca de usuário. */
import { expect, test, USERS } from './fixtures'

test.describe('Conta e sessão', () => {
  test('cadastro com validação, conflito e sucesso', async ({ app, page }) => {
    await app.goto('/cadastro')
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: /^Criar (conta|perfil)$/ }).click()
    await expect(dialog.getByText('Mínimo de 3 caracteres')).toBeVisible()
    await expect(dialog.getByText('Informe um e-mail válido')).toBeVisible()
    await expect(dialog.getByLabel('Nome de usuário')).toHaveAttribute('aria-invalid', 'true')

    // Conflito: e-mail e usuário já existentes (erro vem da API, aparece no campo)
    await dialog.getByLabel('Nome de usuário').fill('ana_nft')
    await dialog.getByLabel('E-mail').fill(USERS.ana.email)
    await dialog.getByLabel('Senha', { exact: true }).fill('Novo2026!')
    await dialog.getByLabel('Confirmar senha').fill('Novo2026!')
    await dialog.getByRole('button', { name: /^Criar (conta|perfil)$/ }).click()
    await expect(dialog.getByText('Este e-mail já está cadastrado')).toBeVisible()
    await expect(dialog.getByText('Este nome de usuário já está em uso')).toBeVisible()

    await dialog.getByLabel('Nome de usuário').fill('carla_teste')
    await dialog.getByLabel('E-mail').fill('carla@kurio.test')
    await dialog.getByRole('button', { name: /^Criar (conta|perfil)$/ }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
    await app.goto('/perfil')
    await expect(page.getByLabel('Nome de usuário')).toHaveValue('carla_teste')
  })

  test('login inválido, sessão expirada com retomada, logout e troca de usuário', async ({ app, page }) => {
    // Relógio controlado: a expiração da sessão acontece "2 minutos depois" sem esperar de verdade.
    await page.clock.install()
    await app.goto('/login')
    await app.setScenario({ sessionTtlSec: 60 })
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('E-mail').fill(USERS.ana.email)
    await dialog.getByLabel('Senha', { exact: true }).fill('senha-errada1')
    await dialog.getByRole('button', { name: 'Entrar', exact: true }).click()
    await expect(dialog.getByTestId('form-error')).toHaveText('E-mail ou senha incorretos')

    await dialog.getByLabel('Senha', { exact: true }).fill(USERS.ana.password)
    await dialog.getByRole('button', { name: 'Entrar', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
    await app.goto('/perfil/carteiras')
    await expect(page.getByTestId('wallet-form-primary')).toBeVisible()

    // Sessão expira durante a navegação → login com aviso → volta para a mesma página
    await page.clock.fastForward('02:00')
    await page.getByRole('link', { name: 'Lista de interesse' }).first().click()
    await expect(page).toHaveURL(/\/login\?.*reason=expired/)
    await expect(page.getByRole('dialog').getByText(/Sua sessão expirou/)).toBeVisible()
    await app.setScenario({ sessionTtlSec: 3600 })
    const again = page.getByRole('dialog')
    await again.getByLabel('E-mail').fill(USERS.ana.email)
    await again.getByLabel('Senha', { exact: true }).fill(USERS.ana.password)
    await again.getByRole('button', { name: 'Entrar', exact: true }).click()
    await expect(page).toHaveURL(/\/perfil\/favoritos/)
    // Favoritos da Ana: Emerald Ape #042 e #017
    await expect(page.getByTestId('favorites-grid').getByTestId('nft-card')).toHaveCount(2)

    // Logout limpa dados privados; troca para Bruno não mostra nada da Ana
    await page.getByRole('button', { name: 'Sair' }).click()
    await expect(page).toHaveURL(/\/$/)
    await page.waitForFunction(() => !localStorage.getItem('jungle.session.token'))
    await app.login('bruno')
    await app.goto('/perfil/favoritos')
    const grid = page.getByTestId('favorites-grid').getByTestId('nft-card')
    await expect(grid).toHaveCount(1)
    await expect(grid.first()).toContainText('Violet Nomad #314')
    await app.goto('/perfil/carteiras')
    await expect(page.getByLabel('Endereço da carteira').first()).not.toHaveValue(/A91F/)
  })
})
