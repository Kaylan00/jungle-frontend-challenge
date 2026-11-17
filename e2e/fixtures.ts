/**
 * Base dos testes E2E.
 *
 * - Cada teste roda num contexto novo do navegador: localStorage vazio = "banco" simulado na seed.
 * - O cenário de rede padrão dos testes é "sem latência" (determinístico e rápido). Testes que
 *   precisam de lentidão ou falha mudam o cenário pela API de controle do mock
 *   (window.__jungleMock), que altera o SERVIDOR simulado — a interface continua recebendo
 *   tudo por REST (handlers MSW) e Socket.IO (socket.io-client).
 */
import { test as base, expect, type Page } from '@playwright/test'
import type { MockControls } from '../src/mocks/controls'

export const USERS = {
  ana: { email: 'ana@kurio.test', password: 'Selva2026!', username: 'ana_nft', name: 'Ana Colecionadora' },
  bruno: { email: 'bruno@kurio.test', password: 'Pixel2026!', username: 'bruno_pixel', name: 'Bruno Pixel' },
}

type Scenario = Record<string, unknown>

export const test = base.extend<{ app: App }>({
  app: async ({ page }, use, testInfo) => {
    // Só grava o cenário inicial se o teste ainda não definiu outro (sobrevive a reload).
    await page.addInitScript(() => {
      const k = 'jungle.mock.scenario.v1'
      if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify({ latency: 'off', paymentDelayMs: 1500 }))
    })
    await use(new App(page, testInfo.project.name === 'mobile'))
  },
})

export { expect }

export class App {
  constructor(
    readonly page: Page,
    readonly isMobile: boolean,
  ) {}

  /** Abre uma rota e espera o app (mocks + React) estar pronto. */
  async goto(path = '/') {
    await this.page.goto(path)
    await this.page.waitForFunction(() => Boolean(window.__jungleMock))
    await expect(this.page.locator('main#conteudo')).toBeVisible()
  }

  /** Chama um controle do servidor simulado (ver src/mocks/controls.ts). */
  mock<K extends keyof MockControls>(name: K, ...args: Parameters<MockControls[K]>) {
    return this.page.evaluate(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ({ name, args }) => (window.__jungleMock as any)[name](...args),
      { name, args: args as unknown[] },
    ) as Promise<Awaited<ReturnType<MockControls[K]>>>
  }

  async setScenario(patch: Scenario) {
    await this.mock('setScenario', patch as never)
  }

  async realtimeConnected() {
    // O indicador só aparece em telas largas; o atributo existe sempre.
    await expect(this.page.getByTestId('realtime-status')).toHaveAttribute('data-status', 'connected')
  }

  async login(user: keyof typeof USERS = 'ana', from = '/login') {
    const u = USERS[user]
    await this.goto(from)
    const dialog = this.page.getByRole('dialog')
    await dialog.getByLabel('E-mail').fill(u.email)
    await dialog.getByLabel('Senha', { exact: true }).fill(u.password)
    await dialog.getByRole('button', { name: 'Entrar', exact: true }).click()
    await expect(this.page.getByRole('dialog')).toBeHidden()
  }

  /** Adiciona uma edição ao carrinho pela tela de detalhe. */
  async addToCart(nftId: string, opts: { edition?: string; quantity?: number; goToCart?: boolean } = {}) {
    await this.goto(`/nft/${nftId}${opts.edition ? `?edicao=${opts.edition}` : ''}`)
    const scope = this.isMobile ? this.page.getByTestId('mobile-buy-bar') : this.page.locator('article')
    for (let i = 1; i < (opts.quantity ?? 1); i++) await scope.getByRole('button', { name: 'Aumentar quantidade' }).first().click()
    if (opts.goToCart === false) {
      await scope.getByRole('button', { name: /Adicionar ao carrinho/ }).first().click()
      await expect(this.page.getByText(/adicionado(s)? ao carrinho/).first()).toBeVisible()
    } else {
      await scope.getByRole('button', { name: this.isMobile ? 'Comprar NFT' : 'Comprar', exact: true }).click()
      await expect(this.page).toHaveURL(/\/carrinho$/)
    }
  }

  cartItems() {
    return this.page.getByTestId(this.isMobile ? 'cart-item-mobile' : 'cart-item')
  }
}

