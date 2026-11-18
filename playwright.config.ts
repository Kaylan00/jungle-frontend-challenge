import { defineConfig, devices } from '@playwright/test'

/**
 * E2E com os mocks (MSW) do próprio app, rodando contra o build otimizado (vite preview).
 * Cada teste usa um contexto novo do navegador = localStorage vazio = estado isolado (seed).
 */
const PORT = 4173

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  // Na CI um teste que falha tem uma segunda tentativa, mas só para gerar o trace: se passar na segunda, ele é
  // "flaky" e a execução reprova mesmo assim (failOnFlakyTests). Instabilidade nunca passa escondida.
  retries: process.env.CI ? 1 : 0,
  failOnFlakyTests: Boolean(process.env.CI),
  workers: process.env.CI ? 2 : undefined,
  timeout: 45_000,
  expect: {
    timeout: 8_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled', caret: 'hide' },
  },
  reporter: [['html', { open: 'never', outputFolder: 'playwright-report' }], ['list']],
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}{ext}',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    serviceWorkers: 'allow',
    // Sem animações (GSAP, rolagem suave, troca automática do destaque): os testes nunca esperam movimento.
    reducedMotion: 'reduce',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    // Tablet (768, a terceira largura pedida no desafio): os fluxos principais, no layout de 768 px.
    {
      name: 'tablet',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 }, hasTouch: true },
      testMatch: /(01-catalogo|02-detalhe|05-carrinho|06-compra|12-carregamento-falhas)\.spec\.ts$/,
    },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
