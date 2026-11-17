import { expect, type Page } from '@playwright/test'

/** No checkout: conecta a carteira selecionada e abre a revisão (cotação da API). */
export async function connectAndReview(page: Page) {
  await page.getByTestId('connect-wallet').click()
  await expect(page.getByTestId('wallet-connection')).toHaveAttribute('data-status', 'connected')
  await page.getByTestId('review-button').click()
  await expect(page.getByTestId('review-dialog')).toBeVisible()
}

export async function confirmPurchase(page: Page) {
  await page.getByTestId('confirm-purchase').click()
}
