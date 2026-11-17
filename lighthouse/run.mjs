/**
 * Auditoria Lighthouse reproduzível.
 *
 * - Build otimizado (`npm run build`) servido por `vite preview` com o cenário padrão dos mocks.
 * - Páginas: início e detalhe do NFT. Perfis: mobile (padrão do Lighthouse, com throttling) e desktop.
 * - 3 medições por página e perfil; relatório HTML/JSON de cada execução + resumo com a mediana.
 * - Saída: lighthouse/reports/<data>/ (summary.json e summary.md).
 *
 * Uso: npm run build && npm run lighthouse
 * Variáveis: LH_URL (padrão: sobe o preview local em :4175), CHROME_PATH (padrão: Chromium do Playwright).
 */
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { homedir, cpus, totalmem, release, platform, tmpdir } from 'node:os'
import { join } from 'node:path'
import lighthouse from 'lighthouse'
import desktopConfig from 'lighthouse/core/config/desktop-config.js'

const RUNS = Number(process.env.LH_RUNS ?? 3)
const PAGES = [
  { name: 'inicio', path: '/' },
  { name: 'detalhe', path: '/nft/nft-01' },
]
const PROFILES = [
  { name: 'mobile', config: undefined },
  { name: 'desktop', config: desktopConfig },
]
const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo']

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const base = join(homedir(), '.cache', 'ms-playwright')
  const dir = existsSync(base) && readdirSync(base).find((d) => /^chromium-\d+$/.test(d))
  if (!dir) throw new Error('Chromium não encontrado. Rode: npx playwright install chromium (ou defina CHROME_PATH)')
  for (const sub of ['chrome-linux64', 'chrome-linux']) {
    const p = join(base, dir, sub, 'chrome')
    if (existsSync(p)) return p
  }
  throw new Error('Binário do Chromium não encontrado em ' + join(base, dir))
}

function launchChrome(chromePath, userDataDir) {
  return new Promise((resolve, reject) => {
    const proc = spawn(chromePath, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', `--user-data-dir=${userDataDir}`, '--remote-debugging-port=0', 'about:blank'])
    const t = setTimeout(() => reject(new Error('Chrome não abriu')), 20_000)
    proc.stderr.on('data', (d) => {
      const m = String(d).match(/DevTools listening on ws:\/\/[^:]+:(\d+)\//)
      if (m) {
        clearTimeout(t)
        resolve({ port: Number(m[1]), kill: () => proc.kill('SIGKILL') })
      }
    })
  })
}

async function startPreview() {
  if (process.env.LH_URL) return { url: process.env.LH_URL, stop: () => {} }
  const port = 4175
  const child = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'pipe', detached: true })
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('preview não subiu')), 30_000)
    child.stdout.on('data', (d) => {
      if (String(d).includes(String(port))) {
        clearTimeout(t)
        resolve()
      }
    })
  })
  // Mata o grupo de processos (npx + vite), senão o preview fica preso na porta.
  return { url: `http://localhost:${port}`, stop: () => process.kill(-child.pid, 'SIGTERM') }
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const outDir = join('lighthouse', 'reports', stamp)
mkdirSync(outDir, { recursive: true })

const { url: baseUrl, stop } = await startPreview()
const chromePath = findChrome()
const summary = {
  date: new Date().toISOString(),
  baseUrl,
  runs: RUNS,
  environment: {
    lighthouse: (await import('lighthouse/package.json', { with: { type: 'json' } })).default.version,
    node: process.version,
    chrome: chromePath,
    os: `${platform()} ${release()}`,
    cpus: `${cpus().length}x ${cpus()[0]?.model ?? ''}`.trim(),
    memoryGb: Math.round(totalmem() / 1e9),
    conditions: 'Build de produção (vite build) servido por vite preview; cenário padrão dos mocks (latência normal 150–400 ms); perfil mobile = throttling simulado padrão do Lighthouse (Moto G Power, 4G lento, CPU 4x); desktop = preset desktop do Lighthouse.',
  },
  results: [],
}

try {
  for (const pageDef of PAGES) {
    for (const profile of PROFILES) {
      const runs = []
      for (let i = 1; i <= RUNS; i++) {
        // Perfil de navegador novo a cada medição: sem cache nem service worker anterior.
        // Chrome aberto direto (o chrome-launcher detecta WSL e converte caminhos para o Windows).
        const userDataDir = mkdtempSync(join(process.platform === 'win32' ? tmpdir() : '/tmp', 'kurio-lh-'))
        const chrome = await launchChrome(chromePath, userDataDir)
        try {
          const result = await lighthouse(
            baseUrl + pageDef.path,
            { port: chrome.port, output: ['html', 'json'], logLevel: 'error', onlyCategories: CATEGORIES },
            profile.config,
          )
          const [html, json] = result.report
          const base = `${pageDef.name}-${profile.name}-${i}`
          writeFileSync(join(outDir, `${base}.html`), html)
          writeFileSync(join(outDir, `${base}.json`), json)
          const lhr = result.lhr
          const run = {
            scores: Object.fromEntries(CATEGORIES.map((c) => [c, Math.round((lhr.categories[c]?.score ?? 0) * 100)])),
            lcpMs: Math.round(lhr.audits['largest-contentful-paint'].numericValue),
            cls: Number(lhr.audits['cumulative-layout-shift'].numericValue.toFixed(3)),
            tbtMs: Math.round(lhr.audits['total-blocking-time'].numericValue),
            fcpMs: Math.round(lhr.audits['first-contentful-paint'].numericValue),
          }
          runs.push(run)
          console.log(`${pageDef.name} ${profile.name} #${i}`, JSON.stringify(run))
        } finally {
          chrome.kill()
          await new Promise((r) => setTimeout(r, 300))
          rmSync(userDataDir, { recursive: true, force: true })
        }
      }
      summary.results.push({
        page: pageDef.path,
        profile: profile.name,
        median: {
          ...Object.fromEntries(CATEGORIES.map((c) => [c, median(runs.map((r) => r.scores[c]))])),
          lcpMs: median(runs.map((r) => r.lcpMs)),
          cls: median(runs.map((r) => r.cls)),
          tbtMs: median(runs.map((r) => r.tbtMs)),
        },
        runs,
      })
    }
  }
} finally {
  stop()
}

writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2))
const rows = summary.results.map(
  (r) =>
    `| ${r.page} | ${r.profile} | ${r.median.performance} | ${r.median.accessibility} | ${r.median['best-practices']} | ${r.median.seo} | ${(r.median.lcpMs / 1000).toFixed(2)} s | ${r.median.cls} | ${r.median.tbtMs} ms |`,
)
const md = [
  `# Lighthouse — mediana de ${RUNS} medições`,
  '',
  `Data: ${summary.date} · Lighthouse ${summary.environment.lighthouse} · Node ${summary.environment.node}`,
  '',
  `Ambiente: ${summary.environment.os}, ${summary.environment.cpus}, ${summary.environment.memoryGb} GB RAM`,
  '',
  `Condições: ${summary.environment.conditions}`,
  '',
  '| Página | Perfil | Performance | Accessibility | Best Practices | SEO | LCP | CLS | TBT |',
  '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ...rows,
  '',
].join('\n')
writeFileSync(join(outDir, 'summary.md'), md)
console.log('\n' + md)
console.log(`Relatórios em ${outDir}`)
