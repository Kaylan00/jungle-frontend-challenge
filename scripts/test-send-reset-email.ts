/**
 * Teste isolado da Vercel Function api/send-reset-email.ts (sem Vercel, sem rede, sem chave real).
 * Chama o handler POST com Requests montados aqui e um fetch falso no lugar da API do Brevo.
 *
 *   npm run test:api      (Node 22.18+: roda TypeScript direto)
 */
import assert from 'node:assert/strict'
import { POST } from '../api/send-reset-email.ts'

const DEPLOY = 'https://kurio-demo.vercel.app'
const TOKEN = `rst_${'a1'.repeat(24)}`
const RESET_URL = `${DEPLOY}/redefinir-senha?token=${TOKEN}`
const ENV_KEYS = ['BREVO_API_KEY', 'BREVO_SENDER_EMAIL', 'BREVO_SENDER_NAME', 'PUBLIC_APP_URL'] as const

type BrevoCall = { url: string; init: RequestInit }
const calls: BrevoCall[] = []
let brevoStatus = 201
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
  calls.push({ url: String(input), init })
  return new Response(JSON.stringify({ messageId: '<fake@brevo>' }), { status: brevoStatus, headers: { 'content-type': 'application/json' } })
}) as typeof fetch

let ipSeq = 0
function call(body: unknown, opts: { origin?: string | null; ip?: string; contentType?: string; host?: string } = {}) {
  const base = opts.host ? `https://${opts.host}` : DEPLOY
  const headers: Record<string, string> = {
    'content-type': opts.contentType ?? 'application/json',
    host: new URL(base).host,
    'x-forwarded-proto': 'https',
    'x-real-ip': opts.ip ?? `203.0.113.${++ipSeq}`,
  }
  if (opts.origin !== null) headers.origin = opts.origin ?? base
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
  ['Origin de outro site: 403', async () => {
    setEnv(enabled)
    const res = await call({ to: 'pessoa@gmail.com', resetUrl: RESET_URL }, { origin: 'https://golpe.example.net' })
    assert.equal(res.status, 403)
    assert.equal(await errorCode(res), 'FORBIDDEN_ORIGIN')
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
    const res = await call({ to: 'Pessoa@Gmail.com', resetUrl: RESET_URL }, { origin: null })
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
    calls.length = 0
    setEnv({ ...enabled, BREVO_SENDER_NAME: 'Kurio Demo', PUBLIC_APP_URL: 'https://kurio.app/' })
    // Com PUBLIC_APP_URL, o host da requisição não vale: link do domínio do host é recusado.
    assert.equal((await call({ to: 'pessoa2@gmail.com', resetUrl: RESET_URL }, { origin: null })).status, 400)
    const ok = await call({ to: 'pessoa2@gmail.com', resetUrl: `https://kurio.app/redefinir-senha?token=${TOKEN}` }, { origin: 'https://kurio.app' })
    assert.equal(ok.status, 202)
    assert.equal(calls.length, 1)
    assert.equal(JSON.parse(String(calls[0].init.body)).sender.name, 'Kurio Demo')
  }],
  ['limite: 4º pedido do mesmo IP é 429; destinatário no limite recebe 202 sem envio', async () => {
    calls.length = 0
    setEnv(enabled)
    for (let i = 1; i <= 3; i++) assert.equal((await call({ to: `ip${i}@gmail.com`, resetUrl: RESET_URL }, { ip: '198.51.100.7' })).status, 202)
    const limited = await call({ to: 'ip4@gmail.com', resetUrl: RESET_URL }, { ip: '198.51.100.7' })
    assert.equal(limited.status, 429)
    assert.ok(Number(limited.headers.get('retry-after')) > 0)
    assert.equal(calls.length, 3)
    calls.length = 0
    for (let i = 1; i <= 4; i++) assert.equal((await call({ to: 'mesma@gmail.com', resetUrl: RESET_URL })).status, 202)
    assert.equal(calls.length, 3, 'o 4º pedido para o mesmo destinatário não envia')
  }],
  ['Brevo fora do ar: 502 EMAIL_SEND_FAILED', async () => {
    calls.length = 0
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
  try {
    await fn()
    console.log(`ok   ${name}`)
  } catch (err) {
    failed += 1
    console.log(`FAIL ${name}\n     ${err instanceof Error ? err.message : String(err)}`)
  }
}
globalThis.fetch = realFetch
setEnv({})
console.log(failed ? `\n${failed} de ${tests.length} falharam` : `\n${tests.length} testes passaram`)
process.exitCode = failed ? 1 : 0
