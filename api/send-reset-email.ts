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
 * - `Origin` é OBRIGATÓRIO e tem que ser o do deploy (sem ele, 403: `curl` puro não dispara); quando o
 *   navegador manda `Sec-Fetch-Site`, ele tem que ser `same-origin` (403 para cross-site e same-site).
 *   Um cliente fora do navegador pode forjar os dois cabeçalhos: por isso os limites abaixo;
 * - só POST (a Vercel responde 405 aos métodos não exportados), só application/json e corpo de até 1 KB
 *   (o corpo legítimo tem ~150 bytes), lido com limite (413 sem carregar o resto);
 * - domínios de teste (kurio.test, example.*, .test, .invalid...) recebem 202 sem envio;
 * - limites: cada IP só pede para UM destinatário por janela de 10 min (outro endereço = 429) e no
 *   máximo 3 pedidos na janela; cada destinatário recebe no máximo 1 e-mail a cada 5 min (cooldown, com
 *   resposta neutra 202) e 3 por hora; e um teto de 30 envios por hora na instância (contra rodízio de IP).
 *   Tudo em memória: vale POR INSTÂNCIA da função e zera quando ela recicla (best-effort). Num backend real
 *   seria um store compartilhado (Redis/KV) e o próprio servidor geraria o token, sem endpoint público.
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
const MAX_BODY_BYTES = 1024
/** Por IP: um destinatário e até 3 pedidos a cada 10 min. */
const IP_WINDOW_MS = 10 * 60_000
const IP_MAX_REQUESTS = 3
/** Por destinatário: 1 e-mail a cada 5 min e até 3 por hora. */
const RECIPIENT_COOLDOWN_MS = 5 * 60_000
const RECIPIENT_WINDOW_MS = 60 * 60_000
const RECIPIENT_MAX = 3
/** Teto da instância: envios por hora, somando todos os IPs e destinatários. */
const INSTANCE_WINDOW_MS = 60 * 60_000
const INSTANCE_MAX = 30
const BREVO_TIMEOUT_MS = 8000

const SendResetEmailBody = z.strictObject({
  to: z.email().max(254),
  resetUrl: z.string().max(2048),
})

type ErrorCode = 'EMAIL_DISABLED' | 'VALIDATION_ERROR' | 'FORBIDDEN_ORIGIN' | 'UNSUPPORTED_MEDIA_TYPE' | 'PAYLOAD_TOO_LARGE' | 'RATE_LIMITED' | 'EMAIL_SEND_FAILED'

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

/**
 * Lê o corpo em bytes, parando assim que passa do limite: um corpo enorme (com ou sem Content-Length,
 * ou com Content-Length mentiroso) não é carregado inteiro na memória da função. `null` = grande demais.
 */
async function readBodyCapped(request: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) return null
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

// ---------- Limites (em memória, por instância, best-effort) ----------

/** Por IP: o único destinatário da janela e quantos pedidos já fez. */
const ipWindows = new Map<string, { recipient: string; count: number; resetAt: number }>()
/** Por destinatário: horário dos envios na última hora. */
const recipientSends = new Map<string, number[]>()
/** Envios da instância na última hora. */
let instanceSends: number[] = []
const MAX_TRACKED = 5000

function prune(now: number) {
  if (ipWindows.size > MAX_TRACKED) for (const [k, v] of ipWindows) if (v.resetAt <= now) ipWindows.delete(k)
  if (recipientSends.size > MAX_TRACKED) {
    for (const [k, v] of recipientSends) if (v.every((t) => t <= now - RECIPIENT_WINDOW_MS)) recipientSends.delete(k)
  }
  // Teto duro de memória: se ainda estiver cheio (ataque com muitos IPs), esquece os mais antigos.
  while (ipWindows.size > MAX_TRACKED) ipWindows.delete(ipWindows.keys().next().value!)
  while (recipientSends.size > MAX_TRACKED) recipientSends.delete(recipientSends.keys().next().value!)
}

type IpCheck = { ok: true } | { ok: false; retryAfterSec: number }

/** Conta o pedido do IP: um destinatário por janela e até IP_MAX_REQUESTS pedidos. */
function checkIp(ip: string, recipient: string, now: number): IpCheck {
  const entry = ipWindows.get(ip)
  if (!entry || entry.resetAt <= now) {
    ipWindows.set(ip, { recipient, count: 1, resetAt: now + IP_WINDOW_MS })
    return { ok: true }
  }
  const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000))
  if (entry.recipient !== recipient) return { ok: false, retryAfterSec }
  entry.count += 1
  return entry.count <= IP_MAX_REQUESTS ? { ok: true } : { ok: false, retryAfterSec }
}

/** O destinatário pode receber agora? (cooldown entre envios e máximo por hora) */
function recipientMaySend(recipient: string, now: number) {
  const recent = (recipientSends.get(recipient) ?? []).filter((t) => t > now - RECIPIENT_WINDOW_MS)
  recipientSends.set(recipient, recent)
  const last = recent.at(-1)
  return recent.length < RECIPIENT_MAX && (last === undefined || now - last >= RECIPIENT_COOLDOWN_MS)
}

function instanceMaySend(now: number) {
  instanceSends = instanceSends.filter((t) => t > now - INSTANCE_WINDOW_MS)
  return instanceSends.length < INSTANCE_MAX
}

function recordSend(recipient: string, now: number) {
  recipientSends.set(recipient, [...(recipientSends.get(recipient) ?? []), now])
  instanceSends.push(now)
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
  // Quem chama é sempre a própria página do deploy, por fetch: o navegador manda Origin em todo POST e,
  // nos navegadores atuais, Sec-Fetch-Site: same-origin. Sem Origin (curl, script) ou com outro site: 403.
  const origin = request.headers.get('origin')
  if (!origin || origin !== allowedOrigin) return fail(403, 'FORBIDDEN_ORIGIN')
  const fetchSite = request.headers.get('sec-fetch-site')
  if (fetchSite !== null && fetchSite !== 'same-origin') return fail(403, 'FORBIDDEN_ORIGIN')
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return fail(415, 'UNSUPPORTED_MEDIA_TYPE')

  const raw = await readBodyCapped(request, MAX_BODY_BYTES)
  if (raw === null) return fail(413, 'PAYLOAD_TOO_LARGE')
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
  prune(now)
  const ip = checkIp(clientIp(request), to, now)
  if (!ip.ok) return fail(429, 'RATE_LIMITED', { 'retry-after': String(ip.retryAfterSec) })
  // Destinatário em cooldown ou no limite: resposta neutra, sem envio (não confirma nada sobre o endereço).
  if (!recipientMaySend(to, now)) return accepted()
  if (!instanceMaySend(now)) return fail(429, 'RATE_LIMITED', { 'retry-after': '600' })
  // Conta antes de chamar o Brevo: pedidos simultâneos para o mesmo endereço não passam juntos pelo cooldown.
  recordSend(to, now)

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
