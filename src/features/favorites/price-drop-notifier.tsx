import { Link } from '@tanstack/react-router'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { announce } from '@/lib/announcer'
import { formatEth } from '@/lib/eth'
import { onPriceDropAlert } from './price-drops'

/**
 * Aviso "Preço caiu" de um favorito: toast com link para o NFT e o mesmo texto na região aria-live.
 * Montado uma vez no layout raiz (dentro do roteador, então o link navega sem recarregar a página).
 */
export function PriceDropNotifier() {
  useEffect(
    () =>
      onPriceDropAlert((drop) => {
        const message = `Preço caiu: ${drop.name} de ${formatEth(drop.from)} para ${formatEth(drop.to)}`
        // Aviso neutro (cartão do tema), como os demais avisos informativos do app.
        toast(message, {
          id: `price-drop-${drop.nftId}`,
          description: (
            <Link to="/nft/$nftId" params={{ nftId: drop.nftId }} className="font-semibold text-highlight underline underline-offset-4 hover:text-primary" data-testid="price-drop-link">
              Ver {drop.name}
            </Link>
          ),
          duration: 10_000,
          // No mobile os avisos não recebem toque (index.css); este tem link, então continua tocável.
          className: 'kurio-toast-link',
        })
        announce(message)
      }),
    [],
  )
  return null
}
