import { readFileSync } from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

type VercelHeaders = { headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }> }

/**
 * Cabeçalhos de segurança que o vercel.json aplica a todas as rotas (CSP, nosniff, frame-ancestors...).
 * O `vite preview` usa os mesmos, então os testes E2E (que rodam contra o preview) quebram se a CSP de
 * produção bloquear algo do app, do service worker do MSW ou do socket simulado. O `vite dev` fica de fora:
 * o React Refresh precisa de script inline.
 */
function productionSecurityHeaders(): Record<string, string> {
  const config = JSON.parse(readFileSync(path.resolve(import.meta.dirname, 'vercel.json'), 'utf8')) as VercelHeaders
  const global = config.headers?.find((h) => h.source === '/(.*)')
  return Object.fromEntries((global?.headers ?? []).map((h) => [h.key, h.value]))
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // Gera src/routeTree.gen.ts a partir de src/routes e divide cada rota em um chunk próprio.
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: { port: 5173 },
  preview: { port: 4173, headers: productionSecurityHeaders() },
})
