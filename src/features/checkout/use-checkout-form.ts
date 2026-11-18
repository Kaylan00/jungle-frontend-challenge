import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import type { Wallet } from '@/api/contracts'
import { useSession } from '@/features/auth/use-session'
import { CheckoutValues, loadDraft, saveDraft } from './checkout-model'

/**
 * Formulário do pagamento: começa pelo rascunho salvo (refresh, sessão expirada) ou pelos dados da carteira
 * principal, valida com o esquema do contrato e salva o rascunho a cada mudança.
 */
export function useCheckoutForm(wallets: Wallet[]) {
  const { user } = useSession()
  const [defaults] = useState<CheckoutValues>(() => {
    const draft = loadDraft()
    if (draft) return draft
    const primary = wallets.find((w) => w.role === 'primary') ?? wallets[0]
    return {
      displayName: primary.displayName,
      username: user!.username,
      profileName: primary.profileName,
      email: primary.email,
      ensName: primary.ensName,
      referralCode: primary.referralCode,
      note: '',
      network: primary.network,
      provider: primary.provider,
      walletId: primary.id,
    }
  })

  const form = useForm<CheckoutValues>({
    resolver: zodResolver(CheckoutValues),
    defaultValues: defaults,
    mode: 'onTouched',
  })

  useEffect(() => form.subscribe({ formState: { values: true }, callback: ({ values }) => saveDraft(values) }), [form])

  const [walletId, network, provider] = useWatch({ control: form.control, name: ['walletId', 'network', 'provider'] })
  const wallet = wallets.find((w) => w.id === walletId)

  return { form, walletId, network, provider, wallet }
}

export type CheckoutFormApi = ReturnType<typeof useCheckoutForm>
