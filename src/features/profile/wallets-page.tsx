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
import { useForm, useWatch } from 'react-hook-form'
import { WalletInput, type Network, type User, type Wallet, type WalletProvider } from '@/api/contracts'
import { ApiError } from '@/api/http'
import { ErrorState } from '@/components/shared/error-state'
import { FormField, RequiredMark } from '@/components/shared/form-field'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { useSession } from '@/features/auth/use-session'
import { applyApiFieldErrors } from '@/lib/form-errors'
import { cn } from '@/lib/utils'
import { notifyError, notifySuccess, useSaveWallet, useWallets } from './hooks'
import { EnsSuffix, FieldSkeleton, primaryButton } from './profile-page'
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

/** Visual do Figma: títulos de seção 17px em negrito, "Adicionar" laranja 16px, rótulos 4px acima do campo. */
const sectionTitle = 'text-[17px] font-bold leading-4 text-[#f5f1eb]'
const addButton =
  'shrink-0 text-[16px] font-semibold leading-4 text-[#e89b55] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const walletField = 'gap-[3px]'

function SecondaryTitle() {
  return (
    <h2 id="wallet-secondary-title" className={sectionTitle}>
      Carteira secundária
    </h2>
  )
}

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
        <div className="flex flex-col">
          <section aria-labelledby="wallet-primary-title">
            <div className="mb-[37px] flex items-start justify-between gap-4">
              <div>
                <h2 id="wallet-primary-title" className={sectionTitle}>
                  Carteira principal
                </h2>
                <p className="mt-2 text-[14px] leading-4 tracking-[-0.01em] text-[#cfb28c]">Estas carteiras ficam disponíveis no pagamento e para receber NFTs comprados.</p>
              </div>
              {!showSecondaryForm && (
                <button type="button" onClick={() => setSecondaryOpen(true)} aria-controls="wallet-secondary-section" className={addButton}>
                  Adicionar<span className="sr-only"> carteira secundária</span>
                </button>
              )}
            </div>
            <WalletForm key={primary?.id ?? 'new-primary'} role="primary" wallet={primary} user={user} />
          </section>

          <section id="wallet-secondary-section" aria-labelledby="wallet-secondary-title" className="mt-[31px]">
            {showSecondaryForm ? (
              <WalletForm
                key={secondary?.id ?? 'new-secondary'}
                role="secondary"
                wallet={secondary}
                primary={primary}
                user={user}
                autoFocus={!secondary}
                onCancel={secondary ? undefined : () => setSecondaryOpen(false)}
                heading={<SecondaryTitle />}
              />
            ) : (
              <>
                <div className="flex items-start justify-between gap-4">
                  <SecondaryTitle />
                  <button type="button" onClick={() => setSecondaryOpen(true)} aria-expanded={false} className={addButton}>
                    Adicionar<span className="sr-only"> carteira secundária</span>
                  </button>
                </div>
                <p className="mt-[11px] text-[14px] leading-4 text-[#cfb28c]">Você ainda não adicionou uma carteira secundária.</p>
              </>
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
  heading,
}: {
  role: Role
  wallet?: Wallet
  primary?: Wallet
  user: User | null
  autoFocus?: boolean
  onCancel?: () => void
  /** Título mostrado na mesma linha do "Igual à carteira principal" (carteira secundária). */
  heading?: React.ReactNode
}) {
  const save = useSaveWallet()
  const [formError, setFormError] = useState<string | null>(null)
  const [sameAsPrimary, setSameAsPrimary] = useState(false)
  const [initial] = useState(() => (wallet ? toValues(wallet) : emptyValues(role, user)))
  const form = useForm<WalletInput>({ resolver: zodResolver(WalletInput), defaultValues: initial })
  const { errors, isSubmitting } = form.formState
  const network = useWatch({ control: form.control, name: 'network' })
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
      {heading && (
        <div className="mb-[37px] flex items-start justify-between gap-4">
          {heading}
          {role === 'secondary' && primary && (
            <div className="flex items-center gap-[9px]">
              <Checkbox
                id={id('same-as-primary')}
                checked={sameAsPrimary}
                onCheckedChange={(c) => toggleSameAsPrimary(c === true)}
                className="size-4 rounded-full border-[1.5px] border-[#d28a4c] bg-transparent data-[state=checked]:border-[#d28a4c] data-[state=checked]:bg-[#d28a4c] data-[state=checked]:text-[#140d0a] dark:bg-transparent"
              />
              <label htmlFor={id('same-as-primary')} className="text-[14px] leading-4 text-[#f5f1eb]">
                Igual à carteira principal
              </label>
            </div>
          )}
        </div>
      )}
      <div className="grid gap-x-7 gap-y-[29px] md:grid-cols-2 wide:gap-x-[calc(28*var(--u))]">
        <FormField id={id('displayName')} label="Nome de exibição" required containerClassName={walletField} error={errors.displayName?.message} {...form.register('displayName')} />
        <FormField id={id('nickname')} label="Apelido da carteira" required containerClassName={walletField} error={errors.nickname?.message} {...form.register('nickname')} />
        <SelectField id={id('network')} label="Rede" required options={networks} error={errors.network?.message} {...form.register('network', { deps: ['address', 'secondaryAddress'] })} />
        <FormField id={id('profileName')} label="Nome do perfil" required containerClassName={walletField} error={errors.profileName?.message} {...form.register('profileName')} />
        <FormField
          id={id('address')}
          label="Endereço da carteira"
          required
          autoComplete="off"
          spellCheck={false}
          placeholder={network === 'solana' ? 'Endereço Solana da carteira' : 'Endereço 0x da carteira'}
          containerClassName={walletField}
          error={errors.address?.message}
          {...form.register('address')}
        />
        <FormField
          id={id('secondaryAddress')}
          label="ENS ou carteira secundária (opcional)"
          hideLabel
          autoComplete="off"
          spellCheck={false}
          placeholder="ENS ou carteira secundária (opcional)"
          containerClassName={cn(walletField, 'md:pt-5')}
          error={errors.secondaryAddress?.message}
          {...form.register('secondaryAddress')}
        />
        <SelectField id={id('provider')} label="Tipo de carteira" required options={providers} error={errors.provider?.message} {...form.register('provider')} />
        <FormField
          id={id('referralCode')}
          label="Código de indicação"
          required
          autoComplete="off"
          containerClassName={walletField}
          error={errors.referralCode?.message}
          {...form.register('referralCode')}
        />
        <FormField id={id('email')} label="E-mail" required type="email" autoComplete="email" containerClassName={walletField} error={errors.email?.message} {...form.register('email')} />
        <FormField
          id={id('ensName')}
          label="Nome ENS"
          required
          autoComplete="off"
          prefix={<EnsSuffix />}
          containerClassName={walletField}
          error={errors.ensName?.message}
          {...form.register('ensName')}
        />
      </div>
      {formError && (
        <p role="alert" className="mt-4 text-[13px] text-destructive" data-testid="form-error">
          {formError}
        </p>
      )}
      <div className="mt-8 flex items-center gap-3">
        <Button type="submit" disabled={isSubmitting} className={cn(primaryButton, 'min-w-[131px] px-0.5')}>
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
    <div className="flex flex-col gap-[3px]">
      <label htmlFor={id} className="text-[14px] leading-4 text-foreground">
        {label}
        {required && <RequiredMark />}
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
            'h-10 w-full appearance-none rounded-[2px] border border-[#3f2319] bg-transparent pl-3 pr-9 text-[14px] text-foreground [&>option]:bg-card',
            'focus-visible:border-primary focus-visible:outline-none',
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
        <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 size-6 -translate-y-1/2 text-[#b39463]" strokeWidth={1.5} aria-hidden="true" />
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


/** Os 10 campos do WalletForm em carregamento (rótulos fixos; o campo secundário não tem rótulo visível). */
function WalletFieldsSkeleton() {
  return (
    <div className="grid gap-x-7 gap-y-[29px] md:grid-cols-2 wide:gap-x-[calc(28*var(--u))]">
      {['Nome de exibição', 'Apelido da carteira', 'Rede', 'Nome do perfil', 'Endereço da carteira'].map((label) => (
        <FieldSkeleton key={label} label={label} className={walletField} />
      ))}
      <FieldSkeleton label="ENS ou carteira secundária (opcional)" hideLabel required={false} className={cn(walletField, 'md:pt-5')} />
      {['Tipo de carteira', 'Código de indicação', 'E-mail', 'Nome ENS'].map((label) => (
        <FieldSkeleton key={label} label={label} className={walletField} />
      ))}
    </div>
  )
}

/**
 * Carteiras em carregamento: as duas seções com os mesmos títulos, textos e grades do formulário
 * carregado (com carteira principal e secundária, o caso da conta de demonstração).
 */
/** Enquanto a sessão da rota privada é conferida: o layout do perfil com o skeleton das carteiras. */
export function WalletsPending() {
  return (
    <ProfileLayout title="Carteiras">
      <WalletsSkeleton />
    </ProfileLayout>
  )
}

function WalletsSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" data-testid="wallets-loading">
      <p className="sr-only">Carregando carteiras…</p>
      <div className="flex flex-col" aria-hidden="true">
        <div>
          <div className="mb-[37px]">
            <p className={sectionTitle}>Carteira principal</p>
            <p className="mt-2 text-[14px] leading-4 tracking-[-0.01em] text-[#cfb28c]">Estas carteiras ficam disponíveis no pagamento e para receber NFTs comprados.</p>
          </div>
          <WalletFieldsSkeleton />
          <Skeleton className="mt-8 h-10 w-[131px] rounded-[2px]" />
        </div>
        <div className="mt-[31px]">
          <div className="mb-[37px] flex items-start justify-between gap-4">
            <p className={sectionTitle}>Carteira secundária</p>
            <div className="flex items-center gap-[9px]">
              <Skeleton className="size-4 rounded-full" />
              <span className="text-[14px] leading-4 text-[#f5f1eb]">Igual à carteira principal</span>
            </div>
          </div>
          <WalletFieldsSkeleton />
          <Skeleton className="mt-8 h-10 w-[131px] rounded-[2px]" />
        </div>
      </div>
    </div>
  )
}
