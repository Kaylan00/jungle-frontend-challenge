/**
 * Página "Carteiras" (/perfil/carteiras): carteira principal e secundária usadas no pagamento.
 * O mesmo formulário serve para criar (POST /wallets) e editar (PUT /wallets/:id); quem decide é
 * existir ou não uma carteira com aquele papel. A validação roda no navegador com o mesmo schema
 * zod que a API usa (WalletInput: endereço confere com a rede escolhida) e, se a API recusar
 * (ex.: endereço já usado na outra carteira), o erro aparece no próprio campo.
 * "Igual à carteira principal" só copia os dados de cadastro: apelido e endereço continuam próprios.
 */
import { zodResolver } from '@hookform/resolvers/zod'
import { ChevronDown } from 'lucide-react'
import { forwardRef, useEffect, useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { WalletInput, type Network, type User, type Wallet, type WalletProvider } from '@/api/contracts'
import { ApiError } from '@/api/http'
import { ErrorState } from '@/components/shared/error-state'
import { applyApiFieldErrors, FormField } from '@/components/shared/form-field'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { useSession } from '@/features/auth/use-session'
import { cn } from '@/lib/utils'
import { notifyError, notifySuccess, useSaveWallet, useWallets } from './hooks'
import { EnsSuffix } from './profile-page'
import { ProfileLayout } from './profile-layout'

type Role = Wallet['role']

const networks: { value: Network; label: string }[] = [
  { value: 'ethereum', label: 'Ethereum' },
  { value: 'polygon', label: 'Polygon' },
  { value: 'solana', label: 'Solana' },
]

const providers: { value: WalletProvider; label: string }[] = [
  { value: 'metamask', label: 'MetaMask' },
  { value: 'walletconnect', label: 'WalletConnect' },
  { value: 'coinbase', label: 'Coinbase Wallet' },
]

const walletFields = [
  'displayName',
  'nickname',
  'network',
  'profileName',
  'address',
  'secondaryAddress',
  'provider',
  'referralCode',
  'email',
  'ensName',
] as const

/** Campos copiados quando "Igual à carteira principal" está marcado. */
const copiedFromPrimary = ['displayName', 'network', 'profileName', 'secondaryAddress', 'provider', 'referralCode', 'email', 'ensName'] as const

const roleLabel: Record<Role, string> = { primary: 'principal', secondary: 'secundária' }

export function WalletsPage() {
  const wallets = useWallets()
  const { user } = useSession()
  const [secondaryOpen, setSecondaryOpen] = useState(false)

  const primary = wallets.data?.items.find((w) => w.role === 'primary')
  const secondary = wallets.data?.items.find((w) => w.role === 'secondary')
  const showSecondaryForm = Boolean(secondary) || secondaryOpen

  return (
    <ProfileLayout title="Carteiras">
      {wallets.isPending ? (
        <WalletsSkeleton />
      ) : wallets.isError ? (
        <ErrorState
          title="Não foi possível carregar suas carteiras"
          message={wallets.error instanceof ApiError ? wallets.error.message : undefined}
          onRetry={() => void wallets.refetch()}
          retrying={wallets.isFetching}
        />
      ) : (
        <div className="flex flex-col gap-10">
          <section aria-labelledby="wallet-primary-title">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 id="wallet-primary-title" className="text-[14px] font-bold">
                  Carteira principal
                </h2>
                <p className="mt-1 text-[13px] text-muted-foreground">Estas carteiras ficam disponíveis no pagamento e para receber NFTs comprados.</p>
              </div>
              {!showSecondaryForm && (
                <button
                  type="button"
                  onClick={() => setSecondaryOpen(true)}
                  aria-controls="wallet-secondary-section"
                  className="shrink-0 text-[13px] font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Adicionar<span className="sr-only"> carteira secundária</span>
                </button>
              )}
            </div>
            <WalletForm key={primary?.id ?? 'new-primary'} role="primary" wallet={primary} user={user} />
          </section>

          <section id="wallet-secondary-section" aria-labelledby="wallet-secondary-title">
            <h2 id="wallet-secondary-title" className="mb-5 text-[14px] font-bold">
              Carteira secundária
            </h2>
            {showSecondaryForm ? (
              <WalletForm
                key={secondary?.id ?? 'new-secondary'}
                role="secondary"
                wallet={secondary}
                primary={primary}
                user={user}
                autoFocus={!secondary}
                onCancel={secondary ? undefined : () => setSecondaryOpen(false)}
              />
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border px-4 py-5">
                <p className="text-[13px] text-muted-foreground">Você ainda não adicionou uma carteira secundária.</p>
                <button
                  type="button"
                  onClick={() => setSecondaryOpen(true)}
                  aria-expanded={false}
                  className="text-[13px] font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Adicionar<span className="sr-only"> carteira secundária</span>
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </ProfileLayout>
  )
}

function emptyValues(role: Role, user: User | null): WalletInput {
  return {
    role,
    displayName: user?.name ?? '',
    nickname: '',
    network: 'ethereum',
    profileName: '',
    address: '',
    secondaryAddress: '',
    provider: 'metamask',
    referralCode: '',
    email: user?.email ?? '',
    ensName: user?.ensName ?? '',
  }
}

function toValues(wallet: Wallet): WalletInput {
  return {
    role: wallet.role,
    displayName: wallet.displayName,
    nickname: wallet.nickname,
    network: wallet.network,
    profileName: wallet.profileName,
    address: wallet.address,
    secondaryAddress: wallet.secondaryAddress ?? '',
    provider: wallet.provider,
    referralCode: wallet.referralCode,
    email: wallet.email,
    ensName: wallet.ensName,
  }
}

function WalletForm({
  role,
  wallet,
  primary,
  user,
  autoFocus,
  onCancel,
}: {
  role: Role
  wallet?: Wallet
  primary?: Wallet
  user: User | null
  autoFocus?: boolean
  onCancel?: () => void
}) {
  const save = useSaveWallet()
  const [formError, setFormError] = useState<string | null>(null)
  const [sameAsPrimary, setSameAsPrimary] = useState(false)
  const [initial] = useState(() => (wallet ? toValues(wallet) : emptyValues(role, user)))
  const form = useForm<WalletInput>({ resolver: zodResolver(WalletInput), defaultValues: initial })
  const { errors, isSubmitting } = form.formState
  const network = form.watch('network')
  const id = (field: string) => `${role}-wallet-${field}`

  useEffect(() => {
    if (autoFocus) form.setFocus('displayName')
  }, [autoFocus, form])

  const toggleSameAsPrimary = (checked: boolean) => {
    setSameAsPrimary(checked)
    const source = checked && primary ? toValues(primary) : initial
    for (const field of copiedFromPrimary) form.setValue(field, source[field], { shouldDirty: true })
    form.clearErrors(copiedFromPrimary)
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    try {
      const saved = await save.mutateAsync({ id: wallet?.id, input: { ...values, role, secondaryAddress: values.secondaryAddress || null } })
      form.reset(toValues(saved))
      notifySuccess(`Carteira ${roleLabel[role]} salva`)
    } catch (e) {
      const err = e instanceof ApiError ? e : null
      if (err?.fields && applyApiFieldErrors(err.fields, form.setError, walletFields)) {
        notifyError(err.message)
        return
      }
      const msg = err?.message ?? 'Não foi possível salvar a carteira'
      setFormError(msg)
      notifyError(msg)
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate aria-label={`Carteira ${roleLabel[role]}`} data-testid={`wallet-form-${role}`}>
      {role === 'secondary' && primary && (
        <div className="mb-5 flex items-center gap-2">
          <Checkbox id={id('same-as-primary')} checked={sameAsPrimary} onCheckedChange={(c) => toggleSameAsPrimary(c === true)} />
          <label htmlFor={id('same-as-primary')} className="text-[13px]">
            Igual à carteira principal
          </label>
        </div>
      )}
      <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
        <FormField id={id('displayName')} label="Nome de exibição" required error={errors.displayName?.message} {...form.register('displayName')} />
        <FormField id={id('nickname')} label="Apelido da carteira" required error={errors.nickname?.message} {...form.register('nickname')} />
        <SelectField id={id('network')} label="Rede" required options={networks} error={errors.network?.message} {...form.register('network', { deps: ['address', 'secondaryAddress'] })} />
        <FormField id={id('profileName')} label="Nome do perfil" required error={errors.profileName?.message} {...form.register('profileName')} />
        <FormField
          id={id('address')}
          label="Endereço da carteira"
          required
          autoComplete="off"
          spellCheck={false}
          placeholder={network === 'solana' ? 'Endereço Solana da carteira' : 'Endereço 0x da carteira'}
          className="font-mono"
          error={errors.address?.message}
          {...form.register('address')}
        />
        <FormField
          id={id('secondaryAddress')}
          label="ENS ou carteira secundária (opcional)"
          autoComplete="off"
          spellCheck={false}
          placeholder="nome.eth ou endereço"
          error={errors.secondaryAddress?.message}
          {...form.register('secondaryAddress')}
        />
        <SelectField id={id('provider')} label="Tipo de carteira" required options={providers} error={errors.provider?.message} {...form.register('provider')} />
        <FormField id={id('referralCode')} label="Código de indicação" required autoComplete="off" error={errors.referralCode?.message} {...form.register('referralCode')} />
        <FormField id={id('email')} label="E-mail" required type="email" autoComplete="email" error={errors.email?.message} {...form.register('email')} />
        <FormField
          id={id('ensName')}
          label="Nome ENS"
          required
          autoComplete="off"
          prefix={<EnsSuffix />}
          className="rounded-l-none"
          error={errors.ensName?.message}
          {...form.register('ensName')}
        />
      </div>
      {formError && (
        <p role="alert" className="mt-4 text-[13px] text-destructive" data-testid="form-error">
          {formError}
        </p>
      )}
      <div className="mt-6 flex items-center gap-3">
        <Button type="submit" disabled={isSubmitting} className="h-10 min-w-36 font-semibold">
          {isSubmitting ? 'Salvando…' : 'Salvar carteira'}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting} className="h-10">
            Cancelar
          </Button>
        )}
      </div>
    </form>
  )
}

/** Select nativo com o mesmo visual e a mesma acessibilidade do FormField (label, erro ligado ao campo). */
const SelectField = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string; options: { value: string; label: string }[] }
>(function SelectField({ label, error, options, required, id: idProp, className, ...props }, ref) {
  const autoId = useId()
  const id = idProp ?? autoId
  const errorId = `${id}-error`
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium">
        {label}
        {required && (
          <span className="ml-0.5 text-primary" aria-hidden="true">
            *
          </span>
        )}
        {required && <span className="sr-only"> (obrigatório)</span>}
      </label>
      <div className="relative">
        <select
          ref={ref}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          aria-required={required || undefined}
          className={cn(
            'h-10 w-full appearance-none rounded-md border border-input bg-card pl-3 pr-9 text-[13px] text-foreground [&>option]:bg-card',
            'focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
            'aria-[invalid=true]:border-destructive',
            className,
          )}
          {...props}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-primary" aria-hidden="true" />
      </div>
      {error && (
        <p id={errorId} className="flex items-center gap-1 text-[12px] text-destructive" data-testid="field-error">
          <span aria-hidden="true">⚠</span>
          {error}
        </p>
      )}
    </div>
  )
})

function WalletsSkeleton() {
  const fields = (n: number) => (
    <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <Skeleton className="h-[19px] w-32" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  )
  return (
    <div aria-busy="true" aria-live="polite">
      <p className="sr-only">Carregando carteiras…</p>
      <Skeleton className="h-5 w-40" />
      <Skeleton className="mb-5 mt-2 h-4 w-full max-w-md" />
      {fields(10)}
      <Skeleton className="mt-6 h-10 w-36" />
      <Skeleton className="mb-5 mt-10 h-5 w-44" />
      <Skeleton className="h-[66px] w-full" />
    </div>
  )
}
