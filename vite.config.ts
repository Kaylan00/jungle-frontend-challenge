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
    // Gera src/routeTree.gen.ts a partir de src/routes e divide cada rota em um chunk próprio. O skeleton de
    // espera (pendingComponent) também vai para um chunk da rota: o padrão do plugin o deixa no pacote comum,
    // e com ele iriam as páginas de onde os skeletons vêm (pagamento, perfil, seções do painel).
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      codeSplittingOptions: { defaultBehavior: [['component'], ['pendingComponent'], ['errorComponent'], ['notFoundComponent']] },
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              // O React fica com o arquivo de entrada (main.tsx precisa dele antes de tudo); sem este grupo ele
              // iria para o vendor, e o vendor inteiro seria baixado antes de os mocks subirem.
              name: 'react',
              test: /node_modules[\/](react|react-dom|scheduler)[\/]/,
              priority: 2,
            },
            {
              // Núcleo que toda tela da loja usa (roteador, React Query, Axios, avisos, utilitários de classe)
              // num arquivo só, em vez de dezenas de pedaços pequenos baixados em ondas antes da primeira tela.
              // Fica fora o que só algumas telas usam (ícones, Radix, formulários), o zod e o decimal.js (os
              // contratos, que os mocks usam antes do app) e MSW, Socket.IO e animações, cada um no seu tempo.
              name: 'vendor',
              test: /node_modules[\/](@tanstack|axios|sonner|tailwind-merge|clsx|class-variance-authority|use-sync-external-store|seroval|tiny-invariant|tiny-warning|cookie-es)[\/]/,
            },
          ],
        },
      },
    },
  },
  optimizeDeps: { rolldownOptions: { plugins: [mswLightCookieStore()] } },
  server: { port: 5173 },
  preview: {
    port: 4173,
    headers: productionSecurityHeaders(),
    // `npm run lighthouse` serve o build em HTTPS, que no Vite liga HTTP/2, como a Vercel serve em produção.
    // O certificado é gerado na hora pelo script (lighthouse/run.mjs), só para a medição.
    https: process.env.LH_TLS_DIR
      ? { key: readFileSync(path.join(process.env.LH_TLS_DIR, 'key.pem')), cert: readFileSync(path.join(process.env.LH_TLS_DIR, 'cert.pem')) }
      : undefined,
  },
})
