import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SummaryLines } from '@/features/cart/cart-summary'
import { NETWORK_LABEL } from '@/features/catalog/search-params'
import { ART_SIZES, artSources } from '@/lib/art'
import { formatEth } from '@/lib/eth'
import { PROVIDER_LABEL } from './checkout-model'
import type { CheckoutFormApi } from './use-checkout-form'
import type { OrderReviewApi } from './use-order-review'

/**
 * Revisão do pedido com a cotação da API: itens, valores, carteira e validade. Dialog do shadcn (foco preso
 * dentro, Esc fecha, foco volta ao botão). Avisa cotação desatualizada (evento em tempo real) e erros do envio.
 */
export function ReviewDialog({ checkout, review }: { checkout: CheckoutFormApi; review: OrderReviewApi }) {
  const { wallet, network, provider } = checkout
  const { quote, stale, notice, submitting, submitError } = review
  return (
    <Dialog open={review.open} onOpenChange={review.setReviewOpen}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto border-border bg-card sm:max-w-lg" data-testid="review-dialog">
        <DialogHeader>
          <DialogTitle>Revise seu pedido</DialogTitle>
          <DialogDescription>Valores calculados agora pela API para a rede {NETWORK_LABEL[network]}. Confirme para enviar o pedido.</DialogDescription>
        </DialogHeader>
        {quote && (
          <div className="space-y-4 text-[13px]">
            {notice && (
              <p role="alert" className="rounded-md border border-warning/60 bg-warning/10 p-2.5 text-warning" data-testid="review-notice">
                {notice}
              </p>
            )}
            {stale && (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-warning/60 bg-warning/10 p-2.5 text-warning" data-testid="quote-stale">
                Preço ou disponibilidade mudaram durante a revisão.
                <Button size="sm" variant="outline" onClick={review.refresh} busy={review.quoting}>
                  Atualizar revisão
                </Button>
              </div>
            )}
            <ul className="space-y-2">
              {quote.lines.map((l) => (
                <li key={`${l.nftId}-${l.editionId}`} className="flex items-center gap-2">
                  <img {...artSources(l.image, ART_SIZES.reviewRow)} alt="" width={36} height={36} className="size-9 rounded-sm object-cover" />
                  <span className="flex-1">
                    {l.name}{' '}
                    <span className="text-muted-foreground">
                      · {l.editionName} · {l.quantity} × {formatEth(l.unitPrice)}
                    </span>
                  </span>
                  <span className="font-bold text-primary" data-testid="review-line-total">
                    {formatEth(l.lineTotal)}
                  </span>
                </li>
              ))}
            </ul>
            <SummaryLines summary={quote} coupon={quote.coupon} />
            <p className="text-[12px] text-muted-foreground">
              Carteira: {wallet?.nickname} ({PROVIDER_LABEL[provider]}) · Cotação válida até{' '}
              {new Date(quote.expiresAt).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
            {submitError && (
              <p role="alert" className="rounded-md border border-destructive/60 bg-destructive/10 p-2.5 text-destructive" data-testid="submit-error">
                {submitError}
              </p>
            )}
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => review.setReviewOpen(false)} busy={submitting}>
            Voltar
          </Button>
          <Button onClick={() => void review.confirm()} disabled={stale || !quote} busy={submitting} data-testid="confirm-purchase">
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Enviando pedido…
              </>
            ) : submitError ? (
              'Tentar novamente'
            ) : (
              'Confirmar compra'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
