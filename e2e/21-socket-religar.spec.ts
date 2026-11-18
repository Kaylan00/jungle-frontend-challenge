/**
 * Cenário 21 — religar o Socket.IO pelo painel de cenários: o indicador volta a "conectado" em poucos segundos.
 *
 * Regressão: com o socket "fora do ar", o mock fechava o WebSocket antes do handshake do Engine.IO sem `error`;
 * o socket.io-client só desistia da tentativa no timeout de 20 s e o indicador ficava 7 a 20 s em
 * "Reconectando" depois de "Ligar socket". Agora a recusa chega como erro (connect_error na hora) e a
 * reconexão sai no próximo passo do backoff (no máximo 4 s).
 */
import { expect, test } from './fixtures'

const MAX_RECONNECT_MS = 6_000

test.describe('Socket.IO: desligar e religar pelo painel', () => {
  test.beforeEach(({ app }) => {
    test.skip(app.isMobile, 'Mesmo cliente de tempo real nos dois layouts: mede uma vez')
  })

  test('"Ligar socket" reconecta em até 6 s, mesmo depois de muito tempo fora do ar', async ({ app, page }) => {
    await page.clock.install()
    await app.goto('/')
    await app.realtimeConnected()
    const status = page.getByTestId('realtime-status')

    await page.getByRole('button', { name: 'Abrir painel de cenários da simulação' }).click()
    const panel = page.getByRole('region', { name: 'Painel de cenários da simulação' })
    await panel.getByRole('button', { name: 'Desligar socket' }).click()
    await expect(status).toHaveAttribute('data-status', 'reconnecting')
    // 9 s fora do ar, no relógio da página: o backoff passa por 0,5 → 1 → 2 → 4 s e chega ao teto.
    await page.clock.runFor(9_000)
    await expect(status).toHaveAttribute('data-status', 'reconnecting')

    await panel.getByRole('button', { name: 'Ligar socket' }).click()
    const t0 = Date.now()
    await expect(status).toHaveAttribute('data-status', 'connected', { timeout: MAX_RECONNECT_MS })
    const elapsed = Date.now() - t0
    test.info().annotations.push({ type: 'reconexão (ms)', description: String(elapsed) })
    expect(elapsed).toBeLessThanOrEqual(MAX_RECONNECT_MS)
  })

  test('religar logo depois de desligar também é rápido', async ({ app, page }) => {
    await page.clock.install()
    await app.goto('/')
    await app.realtimeConnected()
    const status = page.getByTestId('realtime-status')
    await app.mock('setRealtimeOffline', true)
    await expect(status).toHaveAttribute('data-status', 'reconnecting')
    await page.clock.runFor(1_000)
    await app.mock('setRealtimeOffline', false)
    const t0 = Date.now()
    await expect(status).toHaveAttribute('data-status', 'connected', { timeout: MAX_RECONNECT_MS })
    expect(Date.now() - t0).toBeLessThanOrEqual(MAX_RECONNECT_MS)
  })
})
