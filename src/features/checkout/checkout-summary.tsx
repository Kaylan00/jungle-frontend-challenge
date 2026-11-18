import { Link } from '@tanstack/react-router'
import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import type { Cart } from '@/api/contracts'
import { CouponForm, SummaryLines } from '@/features/cart/cart-summary'
import { ART_SIZES, artSources } from '@/lib/art'
import { formatEth } from '@/lib/eth'

/**
 * Resumo da compra na coluna da direita: "Seus NFTs", cupom e os valores. São irmãos diretos da coluna (a ordem
 * no celular é dada por CSS junto com a carteira), por isso o componente devolve um fragmento.
 */
export function CheckoutSummary({ cart }: { cart: Cart }) {
  const [showCoupon, setShowCoupon] = useState(false)
  return (
    <>
      <section aria-labelledby="seus-nfts" className="max-md:order-3">
        <div className="mb-2 flex justify-between text-[14px] font-semibold lg:mb-3 lg:block lg:border-b lg:border-[#442c1b] lg:pb-2 lg:font-normal">
          <h2 id="seus-nfts" className="lg:text-[17px] lg:font-bold lg:leading-6">
            Seus NFTs
          </h2>
          <p className="lg:mt-[3px] lg:flex lg:justify-between lg:text-[16px] lg:leading-6">
            <span className="hidden lg:inline">NFTs</span>
            <span>Subtotal</span>
          </p>
        </div>
        <ul className="space-y-2 lg:space-y-3">
          {cart.items.map((i) => (
            <li key={i.id} className="flex items-center gap-2 rounded-md bg-card p-1.5 text-[13px] lg:h-[70px] lg:rounded-none lg:bg-[#241612] lg:py-0 lg:pl-1 lg:pr-3 wide:h-[calc(70*var(--u))]">
              <img {...artSources(i.image, ART_SIZES.checkoutRow)} alt="" width={70} height={70} className="size-10 rounded-sm object-cover lg:size-[70px] lg:rounded-[4px] wide:size-[calc(70*var(--u))]" />
              <div className="min-w-0 flex-1 lg:ml-[1px]">
                <p className="truncate font-bold lg:text-[15px] lg:leading-[22px] lg:tracking-[0.5px]">{i.name}</p>
                <p className="text-[11px] text-muted-foreground lg:text-[13px] lg:leading-5 lg:tracking-[0.3px] lg:text-[#a98b5d]">Edição {i.editionName}</p>
              </div>
              <span className="text-[12px] text-muted-foreground lg:text-[13px] lg:text-[#c2a682]">(x {i.quantity})</span>
              <span className="w-24 text-right font-bold text-primary lg:w-[100px] lg:text-[18px] lg:text-[#e89b55]">{formatEth(i.lineTotal)}</span>
            </li>
          ))}
        </ul>
        {cart.items.some((i) => i.issue) && (
          <p role="alert" className="mt-2 flex items-center gap-1.5 text-[12px] text-warning">
            <AlertTriangle className="size-3.5" aria-hidden="true" /> Há itens com preço ou estoque alterados.{' '}
            <Link to="/carrinho" className="underline">
              Revisar carrinho
            </Link>
          </p>
        )}
      </section>

      {showCoupon || cart.coupon ? (
        <div className="max-md:order-4">
          <CouponForm cart={cart} />
        </div>
      ) : (
        <button type="button" className="w-full text-center text-[13px] hover:text-primary max-md:order-4 lg:!mt-[7px] lg:text-[14px] lg:leading-6" onClick={() => setShowCoupon(true)}>
          Tem um código promocional? <span className="text-primary lg:text-inherit">Aplique aqui</span>
        </button>
      )}

      <SummaryLines summary={cart.summary} coupon={cart.coupon} variant="checkout" className="max-md:order-5 lg:!mt-[7px]" />
      <p className="-mt-2 text-[11px] text-muted-foreground max-md:order-6 max-md:-mt-3 lg:sr-only">A taxa de rede final depende da rede escolhida e é confirmada na revisão.</p>
    </>
  )
}
