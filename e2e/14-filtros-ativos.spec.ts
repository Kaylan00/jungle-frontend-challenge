/** Cenário 14 — etiquetas de filtros ativos acima da grade e faixa de preço digitada (Mín./Máx.). */
import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, test, type App } from './fixtures'

const cards = (page: Page) => page.getByTestId('catalog-grid').getByTestId('nft-card')
const chips = (page: Page) => page.getByRole('list', { name: 'Filtros ativos' })
const prices = async (page: Page) => (await cards(page).getByTestId('nft-price').allTextContents()).map((t) => Number(t.replace(/[^\d.]/g, '')))

/** Estado da URL como o roteador lê (cada valor em JSON quando dá: arrays, números, booleanos). */
function urlState(page: Page) {
  const out: Record<string, unknown> = {}
  for (const [key, value] of new URL(page.url()).searchParams) {
    try {
      out[key] = JSON.parse(value)
    } catch {
      out[key] = value
    }
  }
  return out
}

/** Caixa de filtros: a lateral no desktop, a gaveta no mobile. */
async function filtersBox(app: App) {
  if (!app.isMobile) return app.page.getByRole('complementary', { name: 'Filtros do catálogo' })
  await app.page.getByRole('button', { name: /^Filtros/ }).click()
  return app.page.getByRole('dialog')
}

test.describe('Filtros ativos e preço digitado', () => {
  test('etiqueta remove só aquele filtro, volta para a página 1, avisa e leva o foco adiante', async ({ app, page }) => {
    await app.goto('/')
    // Sem filtro, a linha de etiquetas nem existe (a grade não se move).
    await expect(page.getByTestId('active-filters')).toHaveCount(0)

    await app.goto('/?category=musica&category=jogos&page=2')
    await expect(cards(page)).toHaveCount(1) // 10 resultados: a página 2 tem 1
    await expect(chips(page).getByRole('button')).toHaveText(['Música', 'Jogos'])
    if (app.isMobile) await expect(page.getByRole('button', { name: 'Filtros, 2 ativos' })).toBeVisible()

    await chips(page).getByRole('button', { name: 'Remover filtro Jogos' }).click()
    await expect.poll(() => urlState(page)).toEqual({ category: ['musica'] })
    await expect(cards(page)).toHaveCount(7)
    await expect(page.getByTestId('live-polite')).toHaveText('Filtro Jogos removido.')
    await expect(chips(page).getByRole('button', { name: 'Remover filtro Música' })).toBeFocused()
    if (app.isMobile) {
      await expect(page.getByRole('button', { name: 'Filtros, 1 ativo' })).toBeVisible()
      await expect(page.getByTestId('filters-count')).toHaveText('1')
    } else {
      const aside = page.getByRole('complementary', { name: 'Filtros do catálogo' })
      await expect(aside.getByRole('checkbox', { name: /Jogos/ })).not.toBeChecked()
      await expect(aside.getByRole('checkbox', { name: /Música/ })).toBeChecked()
    }

    // A última etiqueta sai pelo teclado: a linha some e o foco vai para a aba ativa.
    await page.keyboard.press('Enter')
    await expect.poll(() => urlState(page)).toEqual({})
    await expect(chips(page)).toHaveCount(0)
    await expect(cards(page)).toHaveCount(9)
    await expect(page.getByTestId('live-polite')).toHaveText('Filtro Música removido.')
    await expect(page.getByRole('tab', { name: 'Todos os NFTs' })).toBeFocused()
    if (app.isMobile) await expect(page.getByTestId('filters-count')).toHaveCount(0)
  })

  test('"Limpar tudo" tira busca e filtros e mantém a ordenação', async ({ app, page }) => {
    await app.goto('/?q=Golden&network=polygon&onlyAvailable=true&sort=price_asc')
    await expect(chips(page).getByRole('button')).toHaveText(['Busca: “Golden”', 'Polygon', 'Somente disponíveis'])
    await expect(cards(page)).toHaveCount(4)
    if (app.isMobile) {
      // O contador do botão de filtros bate com as etiquetas, e a linha rola por dentro (sem rolagem lateral na página).
      await expect(page.getByTestId('filters-count')).toHaveText('3')
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
    }

    // Remover a busca limpa o campo de busca também.
    await chips(page).getByRole('button', { name: 'Remover filtro Busca: “Golden”' }).click()
    await expect.poll(() => urlState(page)).toEqual({ network: ['polygon'], onlyAvailable: true, sort: 'price_asc' })
    const searchBox = app.isMobile ? page.getByRole('combobox', { name: 'Buscar coleções e NFTs' }) : page.getByTestId('catalog-search')
    await expect(searchBox).toHaveValue('')
    await expect(page.getByTestId('results-summary')).toHaveText(/^11 NFTs encontrados/)
    await expect(cards(page).first()).toContainText('Ivory Knight #256')

    await page.getByRole('button', { name: 'Limpar tudo' }).click()
    await expect.poll(() => urlState(page)).toEqual({ sort: 'price_asc' })
    await expect(chips(page)).toHaveCount(0)
    await expect(page.getByTestId('live-polite')).toHaveText('Todos os filtros foram removidos.')
    await expect(page.getByTestId('results-summary')).toHaveText(/^36 NFTs encontrados/)
    await expect(cards(page).first()).toContainText('Ivory Knight #256')
    if (app.isMobile) await expect(page.getByTestId('filters-count')).toHaveCount(0)
  })

  test('preço digitado com vírgula ou ponto, sincronizado com o slider, aplica pelo Enter e pelo botão', async ({ app, page }) => {
    await app.goto('/?sort=price_asc')
    let box = await filtersBox(app)
    const min = () => box.getByRole('textbox', { name: /^Mín\./ })
    const max = () => box.getByRole('textbox', { name: /^Máx\./ })
    await expect(min()).toHaveValue('0,00')
    await expect(max()).toHaveValue('12,30')

    // Slider -> campo
    await box.getByRole('slider', { name: 'Preço mínimo' }).focus()
    await page.keyboard.press('PageUp')
    await expect(min()).toHaveValue('0,10')

    // Campo -> slider (vírgula decimal) e Enter aplica
    await min().fill('0,5')
    await max().fill('1,2')
    await expect(box.getByRole('slider', { name: 'Preço mínimo' })).toHaveAttribute('aria-valuenow', '0.5')
    await expect(box.getByRole('slider', { name: 'Preço máximo' })).toHaveAttribute('aria-valuenow', '1.2')
    await max().press('Enter')
    await expect.poll(() => urlState(page)).toEqual({ sort: 'price_asc', minPrice: 0.5, maxPrice: 1.2 })
    await expect(min()).toHaveValue('0,50')
    await expect(max()).toHaveValue('1,20')
    if (app.isMobile) await page.keyboard.press('Escape')
    await expect(chips(page).getByRole('button', { name: 'Remover filtro Preço: 0,50 – 1,20 ETH' })).toBeVisible()
    await expect(page.getByTestId('results-summary')).toHaveText(/^13 NFTs encontrados/)
    let shown = await prices(page)
    expect(shown[0]).toBe(0.52)
    expect(shown.every((p) => p >= 0.5 && p <= 1.2), shown.join(', ')).toBe(true)

    // Ponto decimal, máximo vazio (= sem limite) e o botão "Aplicar"
    box = await filtersBox(app)
    await min().fill('0.75')
    await max().fill('')
    await box.getByRole('button', { name: 'Aplicar' }).click()
    await expect.poll(() => urlState(page)).toEqual({ sort: 'price_asc', minPrice: 0.75 })
    await expect(max()).toHaveValue('12,30')
    if (app.isMobile) await page.keyboard.press('Escape')
    await expect(chips(page).getByRole('button', { name: 'Remover filtro Preço: a partir de 0,75 ETH' })).toBeVisible()
    await expect(page.getByTestId('results-summary')).toHaveText(/^15 NFTs encontrados/)
    shown = await prices(page)
    expect(shown[0]).toBe(0.88)
    expect(shown.every((p) => p >= 0.75), shown.join(', ')).toBe(true)

    // Link compartilhado com o preço restaura campos e slider
    await page.reload()
    box = await filtersBox(app)
    await expect(min()).toHaveValue('0,75')
    await expect(box.getByRole('slider', { name: 'Preço mínimo' })).toHaveAttribute('aria-valuenow', '0.75')
  })

  test('preço inválido não é aplicado: erro ligado ao campo e foco nele', async ({ app, page }) => {
    await app.goto('/')
    const box = await filtersBox(app)
    const min = box.getByRole('textbox', { name: /^Mín\./ })
    const max = box.getByRole('textbox', { name: /^Máx\./ })
    const error = box.getByTestId('price-error')

    // Mínimo maior que o máximo
    await min.fill('2')
    await max.fill('1,5')
    await box.getByRole('button', { name: 'Aplicar' }).click()
    await expect(error).toHaveText(/O mínimo não pode ser maior que o máximo/)
    await expect(max).toHaveAttribute('aria-invalid', 'true')
    await expect(max).toBeFocused()
    const describedBy = await max.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    await expect(box.locator(`#${describedBy}`)).toHaveText(/O mínimo não pode ser maior que o máximo/)
    expect(urlState(page)).toEqual({})

    // Com o erro na tela, o aviso acompanha o que é digitado
    await max.fill('99')
    await expect(error).toHaveText(/Máx\.: informe um valor de 0,00 a 12,30 ETH/)
    await max.fill('1,23456')
    await expect(error).toHaveText(/Máx\.: use só números, com até 4 casas decimais/)
    await max.press('Enter')
    await expect(max).toBeFocused()
    expect(urlState(page)).toEqual({})

    // Corrigido: o erro some e o Enter aplica (até 4 casas)
    await max.fill('3,1234')
    await expect(error).toHaveCount(0)
    await expect(max).not.toHaveAttribute('aria-invalid', 'true')
    await expect(max).not.toHaveAttribute('aria-describedby')
    await max.press('Enter')
    await expect.poll(() => urlState(page)).toEqual({ minPrice: 2, maxPrice: 3.1234 })
  })

  test('sem violações graves de acessibilidade com etiquetas e erro de preço na tela (axe)', async ({ app, page }) => {
    test.skip(app.isMobile, 'Mesma marcação nos dois layouts')
    await app.goto('/?q=Golden&category=musica&network=polygon&minPrice=0.1&maxPrice=2&onlyAvailable=true')
    await expect(chips(page).getByRole('button')).toHaveCount(5)
    const box = await filtersBox(app)
    await box.getByRole('textbox', { name: /^Mín\./ }).fill('abc')
    await box.getByRole('button', { name: 'Aplicar' }).click()
    await expect(box.getByTestId('price-error')).toBeVisible()
    await page.waitForLoadState('networkidle')
    const results = await new AxeBuilder({ page }).include('#catalogo').withTags(['wcag2a', 'wcag2aa']).analyze()
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    expect(serious.map((v) => `${v.id} (${v.nodes.length})`)).toEqual([])
  })
})
