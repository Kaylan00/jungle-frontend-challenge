/**
 * Envio REAL e opcional do e-mail de redefinição de senha.
 *
 * O handler simulado continua sendo a fonte da verdade (token no db, e-mail na caixa de saída
 * simulada, resposta neutra). Além disso, em segundo plano, ele pede à Vercel Function
 * `api/send-reset-email` (Brevo) que mande o mesmo link de verdade. A chave do Brevo só existe lá,
 * em variável de ambiente; sem ela a função responde 503 e nada muda para quem usa a demonstração.
 * No `vite` (dev) a função não existe: o pedido falha em silêncio.
 */
import { bypass } from 'msw'

/** Fora do prefixo simulado de propósito: o MSW deixa passar (ver handlers.ts). */
export const REAL_EMAIL_ENDPOINT = '/api/send-reset-email'

/** Domínios reservados para teste e documentação (kurio.test, example.*, .test, .invalid...). Mesma regra da função. */
export function isTestEmail(email: string) {
  const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase()
  return /\.(test|example|invalid|localhost)$/.test(domain) || /(^|\.)example\.[a-z]{2,}(\.[a-z]{2,})?$/.test(domain)
}

/** Dispara sem esperar e sem nunca falhar: o fluxo simulado não depende disto. */
export function sendRealResetEmail(to: string, resetUrl: string) {
  // Só no navegador da demonstração e nunca em navegador automatizado (testes E2E contra o deploy).
  if (typeof window === 'undefined' || navigator.webdriver || isTestEmail(to)) return
  try {
    const request = bypass(new URL(REAL_EMAIL_ENDPOINT, window.location.origin), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to, resetUrl }),
    })
    fetch(request).catch(() => {})
  } catch {
    // Sem fetch/Request: segue só com o e-mail simulado.
  }
}
