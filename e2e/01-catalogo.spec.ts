/** Cenário 1 — busca, filtros combinados, ordenação, paginação e restauração pelo histórico. */
import { expect, test } from './fixtures'

test.describe('Catálogo', () => {
  test('filtros combinados, ordenação, busca e paginação vivem na URL e voltam pelo histórico', async ({ app, page }) => {
    test.skip(app.isMobile, 'No mobile os mesmos filtros ficam num drawer: coberto no teste seguinte')
    await app.goto('/')
    const cards = page.getByTestId('catalog-grid').getByTestId('nft-card')
    await expect(cards).toHaveCount(9)

    // Paginação
    await page.getByRole('button', { name: 'Página 2', exact: true }).click()
    await expect(page).toHaveURL(/page=2/)
    await expect(page.getByRole('button', { name: 'Página 2', exact: true })).toHaveAttribute('aria-current', 'page')

    // Filtro reinicia a paginação e combina com outro filtro
    await page.getByRole('checkbox', { name: /Música/ }).first().check()
    await expect(page).not.toHaveURL(/page=/)
    await expect(page).toHaveURL(/category=/)
    await page.getByRole('checkbox', { name: /Polygon/ }).first().check()
    await expect(cards).toHaveCount(3)

    // Ordenação por menor preço
    await page.getByTestId('sort-select').click()
    await page.getByRole('option', { name: 'Menor preço' }).click()
    await expect(page).toHaveURL(/sort=price_asc/)
    await expect(cards.first()).toContainText('Golden Groove #099')
    await expect(cards.last()).toContainText('Golden Signal #160')

    // Busca (com debounce) dentro dos filtros
    await page.getByTestId('catalog-search').fill('Signal')
    await expect(page).toHaveURL(/q=Signal/)
    await expect(cards).toHaveCount(1)

    // Voltar no histórico restaura o estado anterior; refresh mantém
    await page.goBack()
    await expect(cards).toHaveCount(3)
    await expect(page).not.toHaveURL(/q=/)
    await page.reload()
    await expect(cards).toHaveCount(3)
    await expect(cards.first()).toContainText('Golden Groove #099')
    await expect(page.getByRole('checkbox', { name: /Música/ }).first()).toBeChecked()

    // Resultado vazio
    await page.getByTestId('catalog-search').fill('nada-com-esse-nome')
    await expect(page.getByText('Nenhum NFT encontrado')).toBeVisible()
    await page.getByRole('button', { name: 'Limpar busca e filtros' }).click()
    await expect(cards).toHaveCount(9)
  })

  test('mobile: filtros no drawer atualizam a URL', async ({ app, page }) => {
    test.skip(!app.isMobile, 'Específico do layout mobile')
    await app.goto('/')
    await page.getByRole('button', { name: /^Filtros/ }).click()
    const sheet = page.getByRole('dialog')
    await sheet.getByRole('checkbox', { name: /Fotografia/ }).check()
    await expect(page).toHaveURL(/category=/)
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('catalog-grid').getByTestId('nft-card')).toHaveCount(3)
  })

  test('respostas fora de ordem não sobrescrevem a busca atual', async ({ app, page }) => {
    test.skip(app.isMobile, 'Comportamento de cache independe do viewport')
    await app.goto('/')
    // A 1ª busca demora 1,6 s e a 2ª 0,2 s: a resposta antiga chega por último.
    await app.setScenario({ outOfOrder: true, latency: 'off' })
    const search = page.getByTestId('catalog-search')
    await search.fill('Golden')
    await page.waitForRequest((r) => r.url().includes('q=Golden'))
    await search.fill('Emerald')
    const cards = page.getByTestId('catalog-grid').getByTestId('nft-card')
    await expect(cards.first()).toContainText('Emerald')
    await page.waitForTimeout(2_000) // tempo para a resposta atrasada de "Golden" chegar
    await expect(cards.first()).toContainText('Emerald')
    for (const text of await cards.allTextContents()) expect(text).toContain('Emerald')
  })
})
