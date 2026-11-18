import { readFileSync } from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

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

/**
 * Troca o cookieStore interno do MSW (tough-cookie + lista de sufixos públicos do tldts, ≈ 2/3 do chunk dos
 * mocks) por uma versão mínima para a mesma origem: ver src/mocks/msw-cookie-store.ts. Vale no build e no
 * `vite dev` (pré-empacotamento das dependências); os testes unitários (msw/node, vitest.config.ts) usam o original.
 */
function mswLightCookieStore() {
  const replacement = path.resolve(import.meta.dirname, 'src/mocks/msw-cookie-store.ts')
  return {
    name: 'msw-light-cookie-store',
    resolveId(source: string, importer: string | undefined) {
      if (importer && /[\\/]node_modules[\\/]msw[\\/]/.test(importer) && /(^|\/)cookieStore\.m?js$/.test(source)) return replacement
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    { ...mswLightCookieStore(), enforce: 'pre' } satisfies Plugin,
    // Gera src/routeTree.gen.ts a partir de src/routes e divide cada rota em um chunk próprio.
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  optimizeDeps: { rolldownOptions: { plugins: [mswLightCookieStore()] } },
  server: { port: 5173 },
  preview: { port: 4173, headers: productionSecurityHeaders() },
})
