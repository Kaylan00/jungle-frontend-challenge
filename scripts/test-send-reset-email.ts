/**
 * Teste isolado da Vercel Function api/send-reset-email.ts (sem Vercel, sem rede, sem chave real).
 * Chama o handler POST com Requests montados aqui e um fetch falso no lugar da API do Brevo.
 * Cada caso importa uma cópia nova do módulo (os limites são em memória, por instância) e controla o relógio.
 *
 *   npm run test:api      (Node 22.18+: roda TypeScript direto)
 */
import assert from 'node:assert/strict'

type Handler = (request: Request) => Promise<Response>

const DEPLOY = 'https://kurio-demo.vercel.app'
const TOKEN = `rst_${'a1'.repeat(24)}`
const RESET_URL = `${DEPLOY}/redefinir-senha?token=${TOKEN}`
const ENV_KEYS = ['BREVO_API_KEY', 'BREVO_SENDER_EMAIL', 'BREVO_SENDER_NAME', 'PUBLIC_APP_URL'] as const
const MIN = 60_000

type BrevoCall = { url: string; init: RequestInit }
const calls: BrevoCall[] = []
let brevoStatus = 201
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
  calls.push({ url: String(input), init })
  return new Response(JSON.stringify({ messageId: '<fake@brevo>' }), { status: brevoStatus, headers: { 'content-type': 'application/json' } })
}) as typeof fetch

// Relógio controlado (a função lê Date.now()).
const realNow = Date.now
let clock = realNow()
Date.now = () => clock
const advance = (ms: number) => (clock += ms)

/** Instância "nova" da função: cópia do módulo com limites zerados (como uma instância recém-criada na Vercel). */
let POST: Handler
let instance = 0
async function freshInstance() {
  const mod = (await import(`../api/send-reset-email.ts?instancia=${++instance}`)) as { POST: Handler }
  POST = mod.POST
}

let ipSeq = 0
type CallOpts = { origin?: string | null; fetchSite?: string | null; ip?: string; contentType?: string; host?: string }
function call(body: unknown, opts: CallOpts = {}) {
  const base = opts.host ? `https://${opts.host}` : DEPLOY
  const headers: Record<string, string> = {
    'content-type': opts.contentType ?? 'application/json',
    host: new URL(base).host,
    'x-forwarded-proto': 'https',
    'x-real-ip': opts.ip ?? `203.0.113.${++ipSeq}`,
  }
  if (opts.origin !== null) headers.origin = opts.origin ?? base
  if (opts.fetchSite !== null) headers['sec-fetch-site'] = opts.fetchSite ?? 'same-origin'
  return POST(new Request(`${base}/api/send-reset-email`, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) }))
}

function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const k of ENV_KEYS) delete process.env[k]
  Object.assign(process.env, values)
}

const enabled = { BREVO_API_KEY: 'chave-falsa-de-teste', BREVO_SENDER_EMAIL: 'no-reply@kurio-demo.dev' }

async function errorCode(res: Response) {
  return ((await res.json()) as { error?: { code?: string } }).error?.code
}

const tests: Array<[string, () => Promise<void>]> = [
  ['sem chave: 503 EMAIL_DISABLED', async () => {
    setEnv({})
    const res = await call({ to: 'pessoa@gmail.com', resetUrl: RESET_URL })
    assert.equal(res.status, 503)
    assert.equal(await errorCode(res), 'EMAIL_DISABLED')
    setEnv({ BREVO_API_KEY: 'x' })
    assert.equal((await call({ to: 'pessoa@gmail.com', resetUrl: RESET_URL })).status, 503, 'só a chave, sem remetente')
  }],
  ['sem Origin (curl, script): 403 FORBIDDEN_ORIGIN, sem chamar o Brevo', async () => {
    setEnv(enabled)
    const res = await call({ to: 'pessoa@gmail.com', resetUrl: RESET_URL }, { origin: null, fetchSite: null })
    assert.equal(res.status, 403)
    assert.equal(await errorCode(res), 'FORBIDDEN_ORIGIN')
    assert.equal(calls.length, 0)
  }],
  ['Origin de outro site: 403', async () => {
    setEnv(enabled)
    const res = await call({ to: 'pessoa@gmail.com', resetUrl: RESET_URL }, { origin: 'https://golpe.example.net', fetchSite: 'cross-site' })
    assert.equal(res.status, 403)
    assert.equal(await errorCode(res), 'FORBIDDEN_ORIGIN')
    // Origin "null" (iframe sandbox, data:) também não passa.
    assert.equal((await call({ to: 'pessoa@gmail.com', resetUrl: RESET_URL }, { origin: 'null' })).status, 403)
  }],
  ['Sec-Fetch-Site presente e diferente de same-origin: 403; ausente (navegador antigo) passa pelo Origin', async () => {
    setEnv(enabled)
    for (const site of ['cross-site', 'same-site', 'none']) {
      assert.equal((await call({ to: 'pessoa@gmail.com', resetUrl: RESET_URL }, { fetchSite: site })).status, 403, site)
    }
    assert.equal(calls.length, 0)
    assert.equal((await call({ to: 'pessoa@gmail.com', resetUrl: RESET_URL }, { fetchSite: null })).status, 202)
    assert.equal(calls.length, 1)
  }],
  ['resetUrl de outro domínio: 400', async () => {
    setEnv(enabled)
    const res = await call({ to: 'pessoa@gmail.com', resetUrl: `https://golpe.example.net/redefinir-senha?token=${TOKEN}` })
    assert.equal(res.status, 400)
    assert.equal(await errorCode(res), 'VALIDATION_ERROR')
  }],
  ['resetUrl com caminho, token ou parâmetros fora do formato: 400', async () => {
    setEnv(enabled)
    const bad = [
      `${DEPLOY}/login?token=${TOKEN}`,
      `${DEPLOY}/redefinir-senha?token=qualquer-coisa`,
      `${DEPLOY}/redefinir-senha?token=${TOKEN}&next=https://golpe.net`,
      `${DEPLOY}/redefinir-senha?token=${TOKEN}#x`,
      `http://kurio-demo.vercel.app/redefinir-senha?token=${TOKEN}`,
      'javascript:alert(1)',
    ]
    for (const resetUrl of bad) assert.equal((await call({ to: 'pessoa@gmail.com', resetUrl })).status, 400, resetUrl)
  }],
  ['corpo inválido ou com campos extras: 400; content-type errado: 415', async () => {
    setEnv(enabled)
    assert.equal((await call({ to: 'não é e-mail', resetUrl: RESET_URL })).status, 400)
    assert.equal((await call({ to: 'pessoa@gmail.com', resetUrl: RESET_URL, html: '<b>oi</b>' })).status, 400)
    assert.equal((await call('{quebrado')).status, 400)
    assert.equal((await call({ to: 'pessoa@gmail.com', resetUrl: RESET_URL }, { contentType: 'text/plain' })).status, 415)
  }],
  ['corpo acima de 1 KB: 413 PAYLOAD_TOO_LARGE, sem chamar o Brevo', async () => {
    setEnv(enabled)
    const big = JSON.stringify({ to: 'pessoa@gmail.com', resetUrl: RESET_URL, pad: 'x'.repeat(1100) })
    const res = await call(big)
    assert.equal(res.status, 413)
    assert.equal(await errorCode(res), 'PAYLOAD_TOO_LARGE')
    // Conta bytes, não caracteres: 520 "ç" (2 bytes cada) passam de 1 KB com cerca de 600 caracteres.
    assert.equal((await call(JSON.stringify({ to: 'pessoa@gmail.com', resetUrl: RESET_URL, pad: 'ç'.repeat(520) }))).status, 413)
    // Content-Length declarado acima do limite: recusa antes de ler.
    const declared = await POST(
      new Request(`${DEPLOY}/api/send-reset-email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': '999999', host: new URL(DEPLOY).host, 'x-forwarded-proto': 'https', origin: DEPLOY },
        body: '{}',
      }),
    )
    assert.equal(declared.status, 413)
    assert.equal(calls.length, 0)
  }],
  ['domínio de teste: 202 sem chamar o Brevo', async () => {
    setEnv(enabled)
    for (const to of ['ana@kurio.test', 'alguem@example.com', 'x@mail.example.com.br', 'y@algo.invalid']) {
      const res = await call({ to, resetUrl: RESET_URL })
      assert.equal(res.status, 202, to)
    }
    assert.equal(calls.length, 0)
  }],
  ['caso válido: 202 e chama o Brevo com o corpo certo', async () => {
    setEnv(enabled)
    const res = await call({ to: 'Pessoa@Gmail.com', resetUrl: RESET_URL })
    assert.equal(res.status, 202)
    assert.deepEqual(await res.json(), { status: 'accepted' })
    assert.equal(calls.length, 1)
    const [{ url, init }] = calls
    assert.equal(url, 'https://api.brevo.com/v3/smtp/email')
    assert.equal(init.method, 'POST')
    const headers = init.headers as Record<string, string>
    assert.equal(headers['api-key'], 'chave-falsa-de-teste')
    assert.equal(headers['content-type'], 'application/json')
    const body = JSON.parse(String(init.body))
    assert.deepEqual(body.sender, { name: 'Kurio', email: 'no-reply@kurio-demo.dev' })
    assert.deepEqual(body.to, [{ email: 'pessoa@gmail.com' }])
    assert.equal(body.subject, 'Redefinição de senha da sua conta Kurio')
    assert.ok(body.htmlContent.includes(`href="${RESET_URL}"`))
    assert.ok(body.htmlContent.includes('KURIO') && body.htmlContent.includes('lang="pt-BR"'))
    assert.ok(body.textContent.includes(RESET_URL))
    assert.ok(body.textContent.includes('30 minutos'))
    assert.deepEqual(Object.keys(body).sort(), ['htmlContent', 'sender', 'subject', 'tags', 'textContent', 'to'])
  }],
  ['BREVO_SENDER_NAME e PUBLIC_APP_URL', async () => {
    setEnv({ ...enabled, BREVO_SENDER_NAME: 'Kurio Demo', PUBLIC_APP_URL: 'https://kurio.app/' })
    // Com PUBLIC_APP_URL, o host da requisição não vale: Origin do host é recusado e link do host também.
    assert.equal((await call({ to: 'pessoa2@gmail.com', resetUrl: RESET_URL })).status, 403)
    assert.equal((await call({ to: 'pessoa2@gmail.com', resetUrl: RESET_URL }, { origin: 'https://kurio.app' })).status, 400)
    const ok = await call({ to: 'pessoa2@gmail.com', resetUrl: `https://kurio.app/redefinir-senha?token=${TOKEN}` }, { origin: 'https://kurio.app' })
    assert.equal(ok.status, 202)
    assert.equal(calls.length, 1)
    assert.equal(JSON.parse(String(calls[0].init.body)).sender.name, 'Kurio Demo')
  }],
  ['por IP: um destinatário por janela (outro endereço = 429) e no máximo 3 pedidos', async () => {
    setEnv(enabled)
    const ip = '198.51.100.7'
    assert.equal((await call({ to: 'primeiro@gmail.com', resetUrl: RESET_URL }, { ip })).status, 202)
    const other = await call({ to: 'segundo@gmail.com', resetUrl: RESET_URL }, { ip })
    assert.equal(other.status, 429)
    assert.equal(await errorCode(other), 'RATE_LIMITED')
    assert.ok(Number(other.headers.get('retry-after')) > 0)
    // O mesmo endereço pode pedir de novo (202 neutro, cooldown), até o 3º pedido; o 4º é 429.
    assert.equal((await call({ to: 'primeiro@gmail.com', resetUrl: RESET_URL }, { ip })).status, 202)
    assert.equal((await call({ to: 'primeiro@gmail.com', resetUrl: RESET_URL }, { ip })).status, 202)
    assert.equal((await call({ to: 'primeiro@gmail.com', resetUrl: RESET_URL }, { ip })).status, 429)
    assert.equal(calls.length, 1, 'só o primeiro envia (os outros caem no cooldown do destinatário)')
    // Passada a janela de 10 min, o IP pode pedir para outro endereço.
    advance(10 * MIN + 1)
    assert.equal((await call({ to: 'segundo@gmail.com', resetUrl: RESET_URL }, { ip })).status, 202)
    assert.equal(calls.length, 2)
  }],
  ['por destinatário: 1 e-mail a cada 5 min e até 3 por hora (202 neutro, sem envio), mesmo trocando de IP', async () => {
    setEnv(enabled)
    const to = 'mesma@gmail.com'
    assert.equal((await call({ to, resetUrl: RESET_URL })).status, 202)
    assert.equal((await call({ to, resetUrl: RESET_URL })).status, 202)
    assert.equal(calls.length, 1, 'cooldown: o segundo não envia')
    advance(5 * MIN)
    assert.equal((await call({ to, resetUrl: RESET_URL })).status, 202)
    advance(5 * MIN)
    assert.equal((await call({ to, resetUrl: RESET_URL })).status, 202)
    assert.equal(calls.length, 3)
    advance(5 * MIN)
    assert.equal((await call({ to, resetUrl: RESET_URL })).status, 202)
    assert.equal(calls.length, 3, 'quarto envio na mesma hora não sai')
    advance(46 * MIN) // o primeiro envio saiu da janela de 1 h
    assert.equal((await call({ to, resetUrl: RESET_URL })).status, 202)
    assert.equal(calls.length, 4)
  }],
  ['pedidos simultâneos para o mesmo endereço: só um envia', async () => {
    setEnv(enabled)
    const results = await Promise.all(Array.from({ length: 5 }, () => call({ to: 'corrida@gmail.com', resetUrl: RESET_URL })))
    assert.deepEqual(results.map((r) => r.status), [202, 202, 202, 202, 202])
    assert.equal(calls.length, 1)
  }],
  ['teto da instância: 30 envios por hora, depois 429 (rodízio de IP e de endereço não passa)', async () => {
    setEnv(enabled)
    for (let i = 0; i < 30; i++) assert.equal((await call({ to: `pessoa${i}@gmail.com`, resetUrl: RESET_URL })).status, 202)
    assert.equal(calls.length, 30)
    const capped = await call({ to: 'pessoa30@gmail.com', resetUrl: RESET_URL })
    assert.equal(capped.status, 429)
    assert.equal(calls.length, 30)
    advance(60 * MIN + 1)
    assert.equal((await call({ to: 'pessoa31@gmail.com', resetUrl: RESET_URL })).status, 202)
  }],
  ['Brevo fora do ar: 502 EMAIL_SEND_FAILED', async () => {
    setEnv(enabled)
    brevoStatus = 401
    const originalError = console.error
    console.error = () => {}
    try {
      const res = await call({ to: 'falha@gmail.com', resetUrl: RESET_URL })
      assert.equal(res.status, 502)
      assert.equal(await errorCode(res), 'EMAIL_SEND_FAILED')
    } finally {
      console.error = originalError
      brevoStatus = 201
    }
  }],
]

let failed = 0
for (const [name, fn] of tests) {
  calls.length = 0
  clock = realNow()
  await freshInstance()
  try {
    await fn()
    console.log(`ok   ${name}`)
  } catch (err) {
    failed += 1
    console.log(`FAIL ${name}\n     ${err instanceof Error ? err.message : String(err)}`)
  }
}
globalThis.fetch = realFetch
Date.now = realNow
setEnv({})
console.log(failed ? `\n${failed} de ${tests.length} falharam` : `\n${tests.length} testes passaram`)
process.exitCode = failed ? 1 : 0
