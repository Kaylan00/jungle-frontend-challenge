import { Link } from '@tanstack/react-router'
import { CheckCircle2, Loader2, MoreVertical, Wallet as WalletIcon } from 'lucide-react'
import type { Cart, Wallet } from '@/api/contracts'
import { Button } from '@/components/ui/button'
import { NETWORK_LABEL } from '@/features/catalog/search-params'
import { formatEth } from '@/lib/eth'
import { cn } from '@/lib/utils'
import { PROVIDER_LABEL, PROVIDER_ORDER, RADIO, walletShortAddress } from './checkout-model'
import type { CheckoutFormApi } from './use-checkout-form'
import type { WalletConnectionApi } from './use-wallet-connection'

/**
 * "Carteira e rede": escolha da carteira (cartões abaixo de lg; no desktop ela fica no select do formulário),
 * tipo de carteira e o quadro da conexão simulada (conectar, recusada, conectada, desconectar).
 */
export function WalletNetworkFieldset({ cart, wallets, checkout, connection }: { cart: Cart; wallets: Wallet[]; checkout: CheckoutFormApi; connection: WalletConnectionApi }) {
  const { form, walletId, network, provider } = checkout
  const { conn, connected } = connection
  const walletError = form.formState.errors.walletId

  return (
    <fieldset className="max-md:order-1 lg:!mt-[2px]">
      <legend className="mb-2 text-center text-[15px] font-semibold max-md:sr-only lg:mb-[17px] lg:w-full lg:text-[17px] lg:font-bold lg:leading-6">Carteira e rede</legend>
      {/* Mobile (Figma): "Carteira conectada" com o atalho para trocar a carteira. */}
      <div className="mb-[13px] flex items-baseline justify-between md:hidden">
        <p className="text-[16px] font-bold leading-6">Carteira conectada</p>
        <Link to="/perfil/carteiras" className="text-[14px] font-bold text-highlight hover:underline">
          Trocar carteira
        </Link>
      </div>
      <div role="radiogroup" aria-label="Carteira" className="space-y-2 max-md:space-y-5 lg:hidden">
        {wallets.map((w) => {
          const checked = w.id === walletId
          return (
            <label
              key={w.id}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-md border border-border bg-card p-3 text-[13px] lg:min-h-[45px] lg:gap-[11px] lg:rounded-[2px] lg:border-[#3f2319] lg:bg-transparent lg:py-[5px] lg:text-[15px]',
                // Mobile (Figma): cartão de 92px sem borda; o rádio mostra a escolha.
                'max-md:min-h-[92px] max-md:gap-5 max-md:rounded-[12px] max-md:border-0 max-md:py-2.5 max-md:pl-[19px] max-md:pr-3',
                checked && 'border-primary lg:border-primary',
              )}
              data-testid="wallet-option"
            >
              <input type="radio" name="wallet" checked={checked} onChange={() => connection.selectWallet(w)} className={RADIO} />
              <span className="min-w-0 flex-1">
                <span className="block font-bold max-md:text-[16px] max-md:leading-6 lg:font-normal lg:leading-[18px]">{w.nickname}</span>
                <span className="block text-[12px] text-muted-foreground max-md:hidden lg:text-[11px] lg:leading-[14px] lg:text-[#b39463]">
                  {walletShortAddress(w)} · Rede {NETWORK_LABEL[w.network]} · {PROVIDER_LABEL[w.provider]}
                </span>
                <span className="mt-[3px] block truncate text-[14px] leading-[22px] text-muted-foreground md:hidden">{walletShortAddress(w)}</span>
                <span className="block text-[14px] leading-[22px] text-muted-foreground md:hidden">Rede {NETWORK_LABEL[w.network]}</span>
              </span>
              <MoreVertical className="size-4 shrink-0 text-[#b19362] md:hidden" aria-hidden="true" />
            </label>
          )
        })}
      </div>
      {walletError && <p className="mt-1 text-[12px] text-destructive">⚠ {walletError.message}</p>}

      {/* Tipo de carteira: três opções do mesmo jeito (ícone, nome e rádio sempre no mesmo lugar).
          Mobile (Figma 414): cartões de 65px com o rádio à direita. Desktop (Figma 1440, Frame 313): linhas de
          405x45 com borda #3F2319 (laranja na escolhida), 16px entre elas e o rádio à esquerda, 12px da borda.
          No Figma desktop a 1ª linha é o selo "METAMASK • WALLETCONNECT • COINBASE"; aqui ela é a opção
          WalletConnect, como no mobile. */}
      <p aria-hidden="true" className="mt-3 text-[16px] font-bold leading-6 md:hidden">
        Carteira e rede
      </p>
      <div role="radiogroup" aria-label="Tipo de carteira" className="mt-3 space-y-2 max-md:mt-[13px] max-md:space-y-4 lg:mt-0 lg:space-y-4">
        {PROVIDER_ORDER.map((p) => (
          <label
            key={p}
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-xl bg-card p-3 text-[13px] transition-colors max-md:h-[65px] max-md:gap-[11px] max-md:py-0 max-md:pl-[14px] max-md:pr-4 max-md:text-[14px]',
              'lg:h-[45px] lg:gap-[11px] lg:rounded-[2px] lg:border lg:border-[#3f2319] lg:bg-transparent lg:px-[11px] lg:py-0 lg:text-[15px] lg:hover:border-primary/60',
              provider === p && 'ring-1 ring-primary max-md:ring-0 lg:border-primary lg:ring-0 lg:hover:border-primary',
            )}
            data-testid="provider-option"
          >
            <input type="radio" name="provider-choice" checked={provider === p} onChange={() => connection.selectProvider(p)} className={cn(RADIO, 'max-lg:order-last')} />
            <span
              aria-hidden="true"
              className="grid size-8 shrink-0 place-items-center rounded-full border border-primary/40 text-[12px] font-bold text-primary max-md:size-10 max-md:border-[#3f2319] max-md:bg-[#2f1d15] max-md:text-[13px] max-md:text-highlight lg:size-[26px] lg:border-[#3f2319] lg:bg-[#2f1d15] lg:text-[11px] lg:text-highlight"
            >
              {p === 'coinbase' ? <WalletIcon className="size-[18px] lg:size-[14px]" strokeWidth={1.75} /> : PROVIDER_LABEL[p][0]}
            </span>
            <span className="flex-1 lg:leading-[18px]">{PROVIDER_LABEL[p]}</span>
          </label>
        ))}
      </div>
      {/* Mobile (Figma): total logo abaixo das carteiras (o resumo completo fica mais abaixo). */}
      <p className="mt-[13px] flex items-baseline justify-end gap-8 text-[16px] font-bold leading-6 md:hidden">
        Total:
        <span className="text-[18px] text-highlight tabular-nums">{formatEth(cart.summary.total)}</span>
      </p>

      <div
        className="mt-3 rounded-md border border-border p-3 text-[13px] max-md:mt-5 max-md:rounded-[12px] max-md:border-0 max-md:bg-card max-md:p-4 lg:mt-4 lg:rounded-[2px] lg:border-[#3f2319]"
        aria-live="polite"
        data-testid="wallet-connection"
        data-status={connected ? 'connected' : conn.status}
      >
        {connected ? (
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-success">
              <CheckCircle2 className="size-4" aria-hidden="true" /> Conectada via {PROVIDER_LABEL[provider]} · {NETWORK_LABEL[network]}
            </span>
            <button type="button" onClick={() => void connection.disconnect()} className="text-primary hover:underline">
              Desconectar
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-muted-foreground">
              <WalletIcon className="size-4" aria-hidden="true" /> Carteira não conectada
            </p>
            {conn.message && (
              <p role="alert" className="text-[12px] text-destructive" data-testid="wallet-error">
                {conn.message}
              </p>
            )}
            <Button type="button" variant="outline" className="w-full" onClick={() => void connection.connect()} disabled={conn.status === 'connecting'} data-testid="connect-wallet">
              {conn.status === 'connecting' ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Aguardando a carteira…
                </>
              ) : (
                `Conectar ${PROVIDER_LABEL[provider]}`
              )}
            </Button>
          </div>
        )}
      </div>
    </fieldset>
  )
}
