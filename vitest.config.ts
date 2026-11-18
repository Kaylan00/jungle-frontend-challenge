import path from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Testes unitários da lógica crítica (valores ETH, contratos, cliente HTTP, tempo real e regras do
 * servidor simulado). Ambiente Node: nenhum desses módulos precisa de DOM. Config separada do
 * vite.config.ts para não carregar os plugins do app (roteador, React, Tailwind) nos testes.
 *
 * Cobertura (`npm run test:coverage`): a lógica que roda em Node (cliente REST e contratos, tempo real, servidor
 * simulado, utilitários e modelos das features). Fora daqui, declarados: telas (.tsx), hooks do React (use-*.ts,
 * hooks.ts) e módulos que só existem no navegador (boot do MSW, barras fixas, animações, título da página,
 * navegação de volta, cookie store do MSW). Esses são exercitados pelos E2E do Playwright.
 */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    restoreMocks: true,
    unstubGlobals: true,
    coverage: {
      provider: 'v8',
      include: ['src/api/**/*.ts', 'src/realtime/**/*.ts', 'src/mocks/**/*.ts', 'src/lib/**/*.ts', 'src/features/**/*-model.ts'],
      exclude: [
        '**/*.test.ts',
        '**/*.d.ts',
        'src/test/**',
        'src/mocks/fixtures/**',
        'src/**/use-*.ts',
        'src/mocks/browser.ts',
        'src/mocks/msw-cookie-store.ts',
        'src/lib/bottom-bars.ts',
        'src/lib/motion.ts',
        'src/lib/page-title.ts',
        'src/lib/decorative.ts',
        'src/lib/back-navigation.ts',
      ],
      reporter: ['text-summary', 'text', 'html'],
      reportsDirectory: 'coverage',
      // Um pouco abaixo do medido (linhas 92%, instruções 87%, funções 85%, ramos 79%): queda real reprova a CI.
      thresholds: { lines: 90, statements: 85, functions: 82, branches: 76 },
    },
  },
})
