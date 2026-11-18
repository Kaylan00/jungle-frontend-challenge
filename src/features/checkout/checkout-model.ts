/**
 * Peças sem interface do pagamento: o esquema do formulário, o rascunho salvo, os nomes das carteiras e as
 * classes compartilhadas pelos campos (formulário e skeleton usam as mesmas para não haver salto ao carregar).
 */
import { z } from 'zod'
import { CollectorInput, Network, WalletProvider, type Wallet } from '@/api/contracts'
import { cn } from '@/lib/utils'

/** Dados do colecionador + carteira, rede e tipo de carteira escolhidos. */
export const CheckoutValues = CollectorInput.extend({
  network: Network,
  provider: WalletProvider,
  walletId: z.string().min(1, 'Selecione uma carteira'),
})
export type CheckoutValues = z.infer<typeof CheckoutValues>

export const PROVIDER_LABEL: Record<WalletProvider, string> = {
  walletconnect: 'WalletConnect',
  metamask: 'MetaMask',
  coinbase: 'Coinbase Wallet',
}
/** Ordem dos cartões de tipo de carteira no Figma mobile. */
export const PROVIDER_ORDER: WalletProvider[] = ['walletconnect', 'metamask', 'coinbase']

/** Rascunho do formulário: sobrevive a refresh e à expiração da sessão (volta preenchido após o login). */
const DRAFT_KEY = 'kurio.checkout.draft'

export function loadDraft(): CheckoutValues | null {
  try {
    const draft = sessionStorage.getItem(DRAFT_KEY)
    if (draft) {
      const parsed = JSON.parse(draft)
      return { ...parsed, note: parsed.note ?? '' }
    }
  } catch {
    /* ignore */
  }
  return null
}

export function saveDraft(values: unknown) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(values))
  } catch {
    /* ignore */
  }
}

export function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY)
  } catch {
    /* ignore */
  }
}

/** Como a carteira aparece nas listas: o ENS/endereço secundário ou o endereço encurtado (0x1234…abcd). */
export const walletShortAddress = (w: Wallet) => w.secondaryAddress ?? `${w.address.slice(0, 6)}…${w.address.slice(-4)}`

export const SELECT =
  'h-10 w-full rounded-md border border-input bg-card px-3 text-[13px] lg:appearance-none lg:rounded-[2px] lg:border-[#3f2319] lg:bg-transparent lg:pr-10 lg:text-[14px] [&>option]:bg-card'

/**
 * Rádio do Figma mobile: anel marrom (clareado para 3:1 de contraste) que fica laranja e ganha o miolo quando marcado.
 * Fica sobre o cartão (#241612), por isso o recorte interno usa a cor do cartão.
 */
const RADIO_MOBILE =
  'max-md:appearance-none max-md:rounded-full max-md:border-[1.5px] max-md:border-[#8c6a4c] max-md:checked:border-primary max-md:checked:bg-primary max-md:checked:shadow-[inset_0_0_0_2.5px_var(--card)]'

/** Rádio do Figma: anel laranja; marcado, ganha o miolo preenchido. */
export const RADIO = cn(
  'size-4 shrink-0 accent-[var(--primary)] lg:appearance-none lg:rounded-full lg:border-[1.5px] lg:border-primary lg:checked:bg-primary lg:checked:shadow-[inset_0_0_0_2.5px_var(--background)]',
  RADIO_MOBILE,
)

/** Grade do pagamento (formulário à esquerda, resumo e carteira à direita): igual no formulário e no skeleton. */
export const CHECKOUT_GRID =
  'grid gap-8 lg:grid-cols-[minmax(0,1fr)_405px] lg:gap-x-8 lg:gap-y-[25px] wide:grid-cols-[minmax(0,1fr)_calc(405*var(--u))] wide:gap-x-[calc(32*var(--u))]'

/** Barra do botão final: fixa no rodapé do celular, na coluna da direita no desktop. */
export const SUBMIT_BAR =
  'max-lg:order-3 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-40 max-md:bg-[linear-gradient(transparent,var(--background)_16px)] max-md:px-7 max-md:pb-[27px] max-md:pt-4 lg:col-start-2'
