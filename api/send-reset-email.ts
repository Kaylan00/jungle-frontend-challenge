/**
 * Vercel Function (Node.js): envio REAL, e opcional, do e-mail de redefinição de senha pelo Brevo.
 *
 * O "backend" da demonstração é o MSW, que roda no navegador. A chave de um provedor de e-mail não
 * pode ficar no navegador (qualquer visitante poderia mandar e-mails em nome da Kurio), então o
 * handler simulado de POST /api/auth/password-reset chama esta função em segundo plano e só ela
 * conhece a chave, lida de variável de ambiente configurada no painel da Vercel.
 *
 * Como a função é pública e não tem como saber se a conta existe (o banco simulado está no
 * navegador), ela só faz uma coisa, do jeito mais restrito possível:
 * - template fixo em pt-BR: o corpo da requisição não leva texto livre, só o destinatário e o link;
 * - o link tem que ser do próprio deploy (PUBLIC_APP_URL ou o host da requisição), no caminho
 *   /redefinir-senha?token=rst_<48 hex>, e é remontado aqui (o texto recebido nunca vai para o e-mail);
 * - Origin diferente do deploy é recusado (outro site não consegue disparar pelo navegador da vítima);
 * - domínios de teste (kurio.test, example.*, .test, .invalid...) recebem 202 sem envio;
 * - limite por IP e por destinatário (3 a cada 10 min). É em memória: vale por instância da função e
 *   zera quando ela recicla, então é best-effort. Num backend real seria um store compartilhado.
 *
 * Sem BREVO_API_KEY e BREVO_SENDER_EMAIL a função responde 503 EMAIL_DISABLED e o app segue só com o
 * e-mail simulado (caixa de saída do MSW).
 */
import { z } from 'zod'

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email'
const RESET_PATH = '/redefinir-senha'
/** Mesmo formato do token gerado em src/mocks/db.ts (createPasswordReset). */
const TOKEN_PATTERN = /^rst_[a-f0-9]{48}$/
/** Mesma validade de src/mocks/db.ts (PASSWORD_RESET_TTL_MIN). */
const LINK_TTL_MIN = 30
const MAX_BODY_BYTES = 4096
const RATE_WINDOW_MS = 10 * 60_000
const RATE_MAX = 3
const BREVO_TIMEOUT_MS = 8000

const SendResetEmailBody = z.strictObject({
  to: z.email().max(254),
  resetUrl: z.string().max(2048),
})

type ErrorCode = 'EMAIL_DISABLED' | 'VALIDATION_ERROR' | 'FORBIDDEN_ORIGIN' | 'UNSUPPORTED_MEDIA_TYPE' | 'RATE_LIMITED' | 'EMAIL_SEND_FAILED'

const NO_STORE = { 'cache-control': 'no-store' }

function fail(status: number, code: ErrorCode, extraHeaders: Record<string, string> = {}) {
  return Response.json({ error: { code } }, { status, headers: { ...NO_STORE, ...extraHeaders } })
}

/** Resposta neutra: igual quando envia, quando ignora (domínio de teste) e quando o destinatário já atingiu o limite. */
function accepted() {
  return Response.json({ status: 'accepted' }, { status: 202, headers: NO_STORE })
}

/** Domínios reservados para teste e documentação (RFC 2606/6761) e os usados na demonstração. */
function isTestEmail(email: string) {
  const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase()
  return /\.(test|example|invalid|localhost)$/.test(domain) || /(^|\.)example\.[a-z]{2,}(\.[a-z]{2,})?$/.test(domain)
}

function readConfig() {
  const apiKey = process.env.BREVO_API_KEY?.trim()
  const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim()
  if (!apiKey || !senderEmail || !z.email().safeParse(senderEmail).success) return null
  const senderName = process.env.BREVO_SENDER_NAME?.trim() || 'Kurio'
  const publicUrl = process.env.PUBLIC_APP_URL?.trim()
  let publicOrigin: string | null = null
  if (publicUrl) {
    try {
      publicOrigin = new URL(publicUrl).origin
    } catch {
      return null
    }
  }
  return { apiKey, senderEmail, senderName, publicOrigin }
}

/** Origin do próprio deploy pelo host da requisição (na Vercel, Host e X-Forwarded-Host vêm da borda). */
function requestOrigin(request: Request) {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  if (!host) return new URL(request.url).origin
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0].trim() || new URL(request.url).protocol.replace(':', '')
  try {
    return new URL(`${proto}://${host}`).origin
  } catch {
    return null
  }
}

/** Aceita só https?://<deploy>/redefinir-senha?token=rst_... e devolve o link remontado (nada do texto recebido passa adiante). */
function canonicalResetUrl(resetUrl: string, allowedOrigin: string) {
  let url: URL
  try {
    url = new URL(resetUrl)
  } catch {
    return null
  }
  if (url.origin !== allowedOrigin || url.pathname !== RESET_PATH) return null
  if (url.username || url.password || url.hash) return null
  const keys = [...url.searchParams.keys()]
  const token = url.searchParams.get('token')
  if (keys.length !== 1 || keys[0] !== 'token' || !token || !TOKEN_PATTERN.test(token)) return null
  return `${allowedOrigin}${RESET_PATH}?token=${token}`
}

// ---------- Limite simples por IP e por destinatário (em memória, best-effort) ----------

const hits = new Map<string, { count: number; resetAt: number }>()

/** Conta uma tentativa e diz se ainda está dentro do limite. */
function withinLimit(key: string, now: number) {
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k)
  }
  const entry = hits.get(key)
  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }
  entry.count += 1
  return entry.count <= RATE_MAX
}

function retryAfterSec(key: string, now: number) {
  const entry = hits.get(key)
  return String(Math.max(1, Math.ceil(((entry?.resetAt ?? now) - now) / 1000)))
}

function clientIp(request: Request) {
  return request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'desconhecido'
}

// ---------- Template fixo ----------

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

const SUBJECT = 'Redefinição de senha da sua conta Kurio'

function textContent(link: string) {
  return [
    'Olá!',
    '',
    'Recebemos um pedido para redefinir a senha da sua conta Kurio.',
    `Para criar uma senha nova, abra o link abaixo. Ele vale por ${LINK_TTL_MIN} minutos e só pode ser usado uma vez.`,
    '',
    link,
    '',
    'Se não foi você, ignore este e-mail: sua senha continua a mesma.',
    '',
    'Kurio, marketplace de NFTs (projeto de demonstração)',
  ].join('\n')
}

function htmlContent(link: string) {
  const href = escapeHtml(link)
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${SUBJECT}</title>
</head>
<body style="margin:0;padding:0;background:#140d0a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#140d0a;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#241612;border-bottom:8px solid #d28a4c;font-family:'Roboto Mono',Menlo,Consolas,monospace;color:#f5ece4;">
<tr><td style="padding:32px 32px 8px;font-size:28px;font-weight:700;letter-spacing:0.11em;">KURIO</td></tr>
<tr><td style="padding:16px 32px 0;font-size:18px;font-weight:700;">Redefinir a senha</td></tr>
<tr><td style="padding:12px 32px 0;font-size:15px;line-height:24px;color:#e6d6c8;">Recebemos um pedido para redefinir a senha da sua conta Kurio. Para criar uma senha nova, use o botão abaixo. O link vale por ${LINK_TTL_MIN} minutos e só pode ser usado uma vez.</td></tr>
<tr><td style="padding:24px 32px;">
<a href="${href}" style="display:inline-block;background:#d28a4c;color:#140d0a;font-size:16px;font-weight:700;text-decoration:none;padding:13px 24px;border-radius:4px;">Criar senha nova</a>
</td></tr>
<tr><td style="padding:0 32px;font-size:13px;line-height:20px;color:#c9a785;">Se o botão não abrir, copie e cole este endereço no navegador:<br><a href="${href}" style="color:#e89b55;word-break:break-all;">${href}</a></td></tr>
<tr><td style="padding:24px 32px 32px;font-size:13px;line-height:20px;color:#c9a785;">Se não foi você, ignore este e-mail: sua senha continua a mesma.</td></tr>
</table>
<p style="margin:16px 0 0;font-family:Menlo,Consolas,monospace;font-size:12px;color:#8a735f;">Kurio, marketplace de NFTs (projeto de demonstração)</p>
</td></tr>
</table>
</body>
</html>`
}

// ---------- Handler ----------

export async function POST(request: Request): Promise<Response> {
  const config = readConfig()
  if (!config) return fail(503, 'EMAIL_DISABLED')

  const allowedOrigin = config.publicOrigin ?? requestOrigin(request)
  if (!allowedOrigin) return fail(400, 'VALIDATION_ERROR')
  // Navegador de outro site: o Origin denuncia (um script fora do navegador pode omitir, mas aí o
  // link continua preso ao domínio do deploy e ao template fixo).
  const origin = request.headers.get('origin')
  if (origin && origin !== allowedOrigin) return fail(403, 'FORBIDDEN_ORIGIN')
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return fail(415, 'UNSUPPORTED_MEDIA_TYPE')

  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) return fail(400, 'VALIDATION_ERROR')
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return fail(400, 'VALIDATION_ERROR')
  }
  const parsed = SendResetEmailBody.safeParse(json)
  if (!parsed.success) return fail(400, 'VALIDATION_ERROR')
  const link = canonicalResetUrl(parsed.data.resetUrl, allowedOrigin)
  if (!link) return fail(400, 'VALIDATION_ERROR')

  const to = parsed.data.to.toLowerCase()
  if (isTestEmail(to)) return accepted()

  const now = Date.now()
  const ipKey = `ip:${clientIp(request)}`
  if (!withinLimit(ipKey, now)) return fail(429, 'RATE_LIMITED', { 'retry-after': retryAfterSec(ipKey, now) })
  // Destinatário no limite: resposta neutra, sem envio (não confirma nada sobre o endereço).
  if (!withinLimit(`to:${to}`, now)) return accepted()

  try {
    const res = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: { 'api-key': config.apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: config.senderName, email: config.senderEmail },
        to: [{ email: to }],
        subject: SUBJECT,
        htmlContent: htmlContent(link),
        textContent: textContent(link),
        tags: ['password-reset'],
      }),
      signal: AbortSignal.timeout(BREVO_TIMEOUT_MS),
    })
    if (!res.ok) {
      // Só o status: nem a chave nem o destinatário vão para o log.
      console.error(`[send-reset-email] Brevo respondeu ${res.status}`)
      return fail(502, 'EMAIL_SEND_FAILED')
    }
  } catch (err) {
    console.error(`[send-reset-email] falha ao chamar o Brevo: ${err instanceof Error ? err.name : 'erro'}`)
    return fail(502, 'EMAIL_SEND_FAILED')
  }
  return accepted()
}
