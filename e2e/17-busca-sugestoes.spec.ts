/**
 * Cenário 17 — busca com sugestões (combobox): debounce, sugestões da API, teclado (setas, Enter, Esc),
 * destaque do trecho que bate, estado vazio e erro com nova tentativa. Desktop: lupa do cabeçalho;
 * mobile: "Explorar coleções".
 */
import { expect, test, type App } from './fixtures'

async function openSearch(app: App) {
  const { page } = app
  await app.goto('/')
  if (app.isMobile) return page.getByRole('combobox', { name: 'Buscar coleções e NFTs' })
  await page.getByRole('button', { name: 'Abrir busca' }).click()
  const input = page.getByRole('combobox', { name: 'Buscar NFTs' })
  await expect(input).toBeFocused()
  return input
}

test.describe('Busca com sugestões', () => {
  test('teclado: setas escolhem, Enter abre o NFT, Esc fecha; o trecho buscado aparece destacado', async ({ app, page }) => {
    const input = await openSearch(app)
    await input.click()
    await input.pressSequentially('emer')
    const listbox = page.getByRole('listbox', { name: 'Sugestões de NFTs' })
    const options = listbox.getByRole('option')
    await expect(options).toHaveCount(5)
    await expect(input).toHaveAttribute('aria-expanded', 'true')
    await expect(options.first()).toContainText('Emerald Ape #042')
    await expect(options.first().locator('mark').first()).toHaveText('Emer')

    await input.press('ArrowDown')
    await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true')
    await input.press('ArrowDown')
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true')
    await expect(input).toHaveAttribute('aria-activedescendant', (await options.nth(1).getAttribute('id'))!)
    await input.press('ArrowUp')
    await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true')

    // Esc fecha a lista e o foco continua no campo.
    await input.press('Escape')
    await expect(listbox).toBeHidden()
    await expect(input).toHaveAttribute('aria-expanded', 'false')
    await expect(input).toBeFocused()

    // ↓ reabre; Enter abre a opção ativa.
    await input.press('ArrowDown')
    await expect(options).toHaveCount(5)
    await input.press('ArrowDown')
    await input.press('ArrowDown')
    const chosen = (await options.nth(1).locator('span span').first().textContent())!.trim()
    await input.press('Enter')
    await expect(page).toHaveURL(/\/nft\/nft-\d+$/)
    await expect(page.getByRole('heading', { level: 1, name: chosen })).toBeVisible()
  })

  test('sem resultado, erro da API e nova tentativa', async ({ app, page }) => {
    const input = await openSearch(app)
    await input.click()
    await input.pressSequentially('zzzz')
    const panel = page.getByTestId('search-suggestions-status')
    await expect(panel).toHaveText('Nenhum NFT encontrado para “zzzz”.')
    await expect(input).toHaveAttribute('aria-expanded', 'false')

    await app.setScenario({ faults: [{ route: 'GET /api/nfts', kind: 'http500', times: -1 }] })
    await input.fill('gol')
    await expect(panel).toContainText('Não foi possível carregar as sugestões.', { timeout: 10_000 })
    await app.setScenario({ faults: [] })
    await panel.getByRole('button', { name: 'Tentar de novo' }).click()
    await expect(page.getByRole('listbox', { name: 'Sugestões de NFTs' }).getByRole('option').first()).toContainText('Gol')
  })
})
