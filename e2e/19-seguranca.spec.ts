/**
 * Cenário 19 — cabeçalhos de segurança da produção (vercel.json, aplicados também pelo `vite preview`):
 * presentes em qualquer rota, CSP de fato aplicada (script inline injetado não roda) e o app inteiro
 * funcionando sob ela: service worker do MSW, REST, Socket.IO simulado e login, sem nenhuma violação.
 */
import { expect, test } from './fixtures'

test.describe('Segurança no navegador', () => {
  test('cabeçalhos de segurança em qualquer rota', async ({ request }) => {
    for (const path of ['/', '/nft/nft-01', '/mockServiceWorker.js']) {
      const res = await request.get(path)
      expect(res.status(), path).toBe(200)
      const h = res.headers()
      expect(h['content-security-policy'], path).toContain("script-src 'self'")
      expect(h['content-security-policy'], path).toContain("frame-ancestors 'none'")
      expect(h['content-security-policy'], path).toContain("object-src 'none'")
      expect(h['x-content-type-options'], path).toBe('nosniff')
      expect(h['x-frame-options'], path).toBe('DENY')
      expect(h['referrer-policy'], path).toBe('strict-origin-when-cross-origin')
      expect(h['permissions-policy'], path).toContain('camera=()')
    }
  })

  test('o app funciona sob a CSP e ela bloqueia script inline', async ({ app, page }) => {
    const violations: string[] = []
    page.on('console', (m) => {
      if (/Content Security Policy/i.test(m.text())) violations.push(m.text())
    })
    await app.goto('/')
    await app.realtimeConnected()
    await app.login('ana')
    await app.goto('/nft/nft-01?edicao=nft-01-ed-3')
    await app.mock('changePrice', 'nft-01', 'nft-01-ed-3', '1.35')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(violations).toEqual([])

    // Prova de que a política vale: um <script> inline injetado no DOM não executa.
    const ran = await page.evaluate(async () => {
      const blocked = new Promise<boolean>((resolve) => {
        document.addEventListener('securitypolicyviolation', () => resolve(true), { once: true })
        setTimeout(() => resolve(false), 1000)
      })
      const s = document.createElement('script')
      s.textContent = 'window.__inlineRan = true'
      document.body.append(s)
      const violation = await blocked
      return { ran: Boolean((window as unknown as { __inlineRan?: boolean }).__inlineRan), violation }
    })
    expect(ran).toEqual({ ran: false, violation: true })
  })
})
