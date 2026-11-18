import path from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Testes unitários da lógica crítica (valores ETH, contratos, cliente HTTP, tempo real e regras do
 * servidor simulado). Ambiente Node: nenhum desses módulos precisa de DOM. Config separada do
 * vite.config.ts para não carregar os plugins do app (roteador, React, Tailwind) nos testes.
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
  },
})
