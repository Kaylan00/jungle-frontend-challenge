import { ChevronDown } from 'lucide-react'
import { Network, type Wallet } from '@/api/contracts'
import { FormField, RequiredMark } from '@/components/shared/form-field'
import { Textarea } from '@/components/ui/textarea'
import { NETWORK_LABEL } from '@/features/catalog/search-params'
import { SELECT, walletShortAddress } from './checkout-model'
import type { CheckoutFormApi } from './use-checkout-form'
import type { WalletConnectionApi } from './use-wallet-connection'

/**
 * "Perfil do colecionador": dados do colecionador, rede, endereço da carteira escolhida e observação.
 * No mobile vem depois da carteira, como no Figma (ordem via CSS na grade do formulário).
 */
export function CollectorProfileSection({ checkout, connection, wallets }: { checkout: CheckoutFormApi; connection: WalletConnectionApi; wallets: Wallet[] }) {
  const { form, wallet, walletId } = checkout
  const { errors } = form.formState
  const reg = form.register

  return (
    <section aria-labelledby="perfil-colecionador" className="max-lg:order-2 lg:row-span-2">
      <h2 id="perfil-colecionador" className="mb-3 text-[15px] font-semibold lg:mb-[13px] lg:text-[17px] lg:font-bold lg:leading-6">
        Perfil do colecionador
      </h2>
      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:gap-x-[23px] lg:gap-y-[17px] wide:gap-x-[calc(23*var(--u))]">
        <FormField label="Nome de exibição" required error={errors.displayName?.message} {...reg('displayName')} />
        <FormField label="Nome de usuário" required error={errors.username?.message} autoComplete="username" {...reg('username')} />
        <div className="flex flex-col gap-1.5 lg:gap-2">
          <label htmlFor="checkout-network" className="text-[13px] font-medium lg:text-[14px] lg:font-normal lg:leading-4">
            Rede
            <RequiredMark className="max-lg:hidden" />
            <span className="ml-0.5 text-primary lg:hidden" aria-hidden="true">
              *
            </span>
          </label>
          <div className="relative">
            <select
              id="checkout-network"
              {...reg('network', { onChange: connection.dropConnection })}
              aria-invalid={errors.network ? true : undefined}
              aria-describedby={errors.network ? 'checkout-network-error' : undefined}
              className={SELECT}
            >
              {Network.options.map((n) => (
                <option key={n} value={n}>
                  {NETWORK_LABEL[n]}
                </option>
              ))}
            </select>
            <SelectChevron />
          </div>
          {errors.network && (
            <p id="checkout-network-error" className="text-[12px] text-destructive">
              ⚠ {errors.network.message}
            </p>
          )}
        </div>
        <FormField label="Nome do perfil" required error={errors.profileName?.message} {...reg('profileName')} />
        {/* Vem da carteira escolhida (somente leitura), mas é obrigatório como no Figma: sem carteira não há pagamento. */}
        <FormField label="Endereço da carteira" required value={wallet?.address ?? ''} readOnly placeholder="Endereço 0x da carteira" />
        {/* Figma: o campo secundário não tem rótulo visível no desktop (fica alinhado ao campo do endereço). */}
        <FormField
          label="ENS ou carteira secundária (opcional)"
          value={wallet?.secondaryAddress ?? ''}
          readOnly
          placeholder="ENS ou carteira secundária (opcional)"
          containerClassName="lg:pt-6 lg:[&>label]:sr-only"
        />
        {/* Desktop: a carteira (das suas, cadastradas no perfil) é escolhida aqui, no lugar do select "Tipo de
            carteira" do Figma; o tipo de carteira (WalletConnect, MetaMask, Coinbase) fica nas três opções de
            "Carteira e rede", ao lado. Abaixo de lg as carteiras aparecem em cartões (Figma mobile). */}
        <div className="flex flex-col gap-2 max-lg:hidden">
          <label htmlFor="checkout-wallet" className="text-[14px] leading-4">
            Carteira
            <RequiredMark />
          </label>
          <div className="relative">
            <select
              id="checkout-wallet"
              value={walletId}
              onChange={(e) => {
                const w = wallets.find((x) => x.id === e.target.value)
                if (w) connection.selectWallet(w)
              }}
              className={SELECT}
            >
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.nickname} · {walletShortAddress(w)} · {NETWORK_LABEL[w.network]}
                </option>
              ))}
            </select>
            <SelectChevron />
          </div>
        </div>
        <FormField label="Código de indicação" required error={errors.referralCode?.message} {...reg('referralCode')} />
        <FormField label="E-mail" required type="email" autoComplete="email" error={errors.email?.message} {...reg('email')} />
        <FormField
          label="Nome ENS"
          required
          error={errors.ensName?.message}
          prefix={
            <span className="mr-2 grid h-10 shrink-0 place-items-center rounded-md border border-input bg-card px-2 text-[13px] lg:rounded-[2px] lg:border-[#3f2319] lg:bg-transparent lg:px-3 lg:text-[14px]">
              .eth
            </span>
          }
          {...reg('ensName')}
        />
      </div>
      <div className="mt-4 flex flex-col gap-1.5 lg:mt-6 lg:gap-2">
        <label htmlFor="checkout-note" className="text-[13px] font-medium lg:text-[14px] lg:font-normal lg:leading-4">
          Observação do colecionador (opcional)
        </label>
        <Textarea
          id="checkout-note"
          rows={5}
          className="max-w-md bg-card lg:h-[152px] lg:w-[350px] lg:max-w-none wide:w-[calc(350*var(--u))] lg:resize-none lg:rounded-[2px] lg:border-[#3f2319] lg:bg-transparent lg:text-[14px] lg:shadow-none"
          aria-describedby={errors.note ? 'checkout-note-error' : undefined}
          {...reg('note')}
        />
        {errors.note && (
          <p id="checkout-note-error" className="text-[12px] text-destructive">
            ⚠ {errors.note.message}
          </p>
        )}
      </div>
    </section>
  )
}

function SelectChevron() {
  return <ChevronDown className="pointer-events-none absolute right-[28px] top-1/2 hidden size-5 -translate-y-1/2 text-[#b39463] lg:block" strokeWidth={1.5} aria-hidden="true" />
}
