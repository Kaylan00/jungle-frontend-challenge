/**
 * Página "Dados do perfil" (/perfil).
 * São três ações independentes, cada uma com sua chamada à API:
 *  - formulário do perfil (nome, usuário, e-mail, ENS, apelido) → PATCH /profile;
 *  - avatar: escolhe a imagem, valida tipo e tamanho (até 1 MB) no navegador e envia como data URL;
 *  - formulário de senha, separado, para a senha só ir à API quando a pessoa realmente quer trocá-la.
 * Erros da API por campo (e-mail em uso, senha atual errada) aparecem no próprio campo.
 * Ao salvar, o cache do perfil e o da sessão recebem o usuário novo, então o cabeçalho atualiza junto.
 */
import { zodResolver } from '@hookform/resolvers/zod'
import { ChevronDown } from 'lucide-react'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { PasswordChangeInput, ProfileInput, type User } from '@/api/contracts'
import { ApiError } from '@/api/http'
import { ErrorState } from '@/components/shared/error-state'
import { FormField, RequiredMark } from '@/components/shared/form-field'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { applyApiFieldErrors } from '@/lib/form-errors'
import { cn } from '@/lib/utils'
import { notifyError, notifySuccess, useChangePassword, useProfile, useRemoveAvatar, useUpdateAvatar, useUpdateProfile } from './hooks'
import { ProfileLayout } from './profile-layout'

const MAX_AVATAR_BYTES = 1024 * 1024
const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp']

export function ProfilePage() {
  const profile = useProfile()

  return (
    <ProfileLayout title="Dados do perfil">
      {profile.isPending ? (
        <ProfileSkeleton />
      ) : profile.isError ? (
        <ErrorState
          title="Não foi possível carregar seu perfil"
          message={profile.error instanceof ApiError ? profile.error.message : undefined}
          onRetry={() => void profile.refetch()}
          retrying={profile.isFetching}
        />
      ) : (
        <ProfileForm user={profile.data}>
          <PasswordForm />
        </ProfileForm>
      )}
    </ProfileLayout>
  )
}

function toProfileInput(user: User): ProfileInput {
  return { name: user.name, username: user.username, email: user.email, ensName: user.ensName, walletNickname: user.walletNickname }
}

const profileFields = ['name', 'username', 'email', 'ensName', 'walletNickname'] as const

/** Campos da tela de perfil: no Figma o rótulo fica 18px acima do campo. */
const profileField = 'gap-[17px]'

/**
 * Formulário do perfil. No Figma há um único botão "Salvar" no fim da página, abaixo da troca de senha;
 * por isso o bloco marcado com data-testid="profile-form" envolve o formulário do perfil, o de senha
 * (passado como children) e o botão, que envia o formulário do perfil pelo atributo form.
 */
function ProfileForm({ user, children }: { user: User; children?: React.ReactNode }) {
  const update = useUpdateProfile()
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<ProfileInput>({ resolver: zodResolver(ProfileInput), defaultValues: toProfileInput(user) })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    try {
      const saved = await update.mutateAsync(values)
      form.reset(toProfileInput(saved))
      notifySuccess('Perfil atualizado')
    } catch (e) {
      const err = e instanceof ApiError ? e : null
      if (err?.fields && applyApiFieldErrors(err.fields, form.setError, profileFields)) {
        notifyError(err.message)
        return
      }
      const msg = err?.message ?? 'Não foi possível salvar o perfil'
      setFormError(msg)
      notifyError(msg)
    }
  })

  return (
    <div data-testid="profile-form" className="flex flex-col">
      <form id="profile-form" onSubmit={onSubmit} noValidate aria-labelledby="profile-form-title">
        <h2 id="profile-form-title" className="mb-[38px] text-[16px] font-bold leading-4 text-[#f5f1eb]">
          Perfil do colecionador
        </h2>
        <div className="grid gap-x-7 gap-y-[30px] md:grid-cols-2 wide:gap-x-[calc(28*var(--u))]">
          <FormField id="profile-name" label="Nome de exibição" required autoComplete="name" containerClassName={profileField} error={errors.name?.message} {...form.register('name')} />
          <FormField
            id="profile-username"
            label="Nome de usuário"
            required
            autoComplete="username"
            containerClassName={profileField}
            error={errors.username?.message}
            {...form.register('username')}
          />
          <FormField id="profile-email" label="E-mail" required type="email" autoComplete="email" containerClassName={profileField} error={errors.email?.message} {...form.register('email')} />
          <FormField
            id="profile-ens"
            label="Nome ENS"
            required
            autoComplete="off"
            prefix={<EnsSuffix />}
            containerClassName={profileField}
            error={errors.ensName?.message}
            {...form.register('ensName')}
          />
          <FormField
            id="profile-wallet-nickname"
            label="Apelido da carteira"
            required
            containerClassName={profileField}
            error={errors.walletNickname?.message}
            {...form.register('walletNickname')}
          />
          <AvatarField user={user} />
        </div>
        {formError && (
          <p role="alert" className="mt-4 text-[13px] text-destructive" data-testid="form-error">
            {formError}
          </p>
        )}
      </form>
      {children}
      <Button type="submit" form="profile-form" disabled={isSubmitting} className={cn('mt-8', primaryButton)}>
        {isSubmitting ? 'Salvando…' : 'Salvar'}
      </Button>
    </div>
  )
}

/** Botão laranja do Figma (perfil e carteiras): 40px de altura, raio de 2px, texto 14px em negrito. */
export const primaryButton = 'h-10 self-start rounded-[2px] bg-[#d28a4c] px-10 text-[14px] font-bold text-[#140d0a] hover:bg-[#dd9a60]'

/**
 * Caixa ".eth" à esquerda do campo (Figma: 78px com seta). O valor salvo é só o nome; o seletor tem
 * uma única opção, então é informativo, mas continua sendo um controle real e rotulado.
 */
export function EnsSuffix() {
  return (
    <span className="relative mr-2.5 flex h-10 w-[78px] shrink-0">
      <select
        aria-label="Domínio ENS"
        defaultValue=".eth"
        className="h-10 w-full appearance-none rounded-[2px] border border-[#3f2319] bg-transparent pl-[9px] pr-7 text-[14px] text-[#f5f1eb] focus-visible:border-primary focus-visible:outline-none [&>option]:bg-card"
      >
        <option value=".eth">.eth</option>
      </select>
      <ChevronDown className="pointer-events-none absolute right-[3px] top-1/2 size-6 -translate-y-1/2 text-[#f5f1eb]" strokeWidth={1.5} aria-hidden="true" />
    </span>
  )
}

function AvatarField({ user }: { user: User }) {
  const updateAvatar = useUpdateAvatar()
  const removeAvatar = useRemoveAvatar()
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const busy = updateAvatar.isPending || removeAvatar.isPending

  const fail = (message: string) => {
    setError(message)
    notifyError(message)
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    if (!AVATAR_TYPES.includes(file.type)) return fail('Use uma imagem PNG, JPEG ou WebP')
    if (file.size > MAX_AVATAR_BYTES) return fail('A imagem deve ter até 1 MB')
    try {
      const dataUrl = await readAsDataUrl(file)
      await updateAvatar.mutateAsync(dataUrl)
      notifySuccess('Avatar atualizado')
    } catch (e) {
      const err = e instanceof ApiError ? e : null
      fail(err?.fields?.avatar ?? err?.message ?? 'Não foi possível enviar a imagem')
    }
  }

  const onRemove = async () => {
    setError(null)
    try {
      await removeAvatar.mutateAsync()
      notifySuccess('Avatar removido')
    } catch (e) {
      fail(e instanceof ApiError ? e.message : 'Não foi possível remover o avatar')
    }
  }

  return (
    <div className="flex flex-col gap-2.5 md:-mt-[7px]" role="group" aria-labelledby="avatar-label" aria-describedby={error ? 'avatar-error' : 'avatar-hint'}>
      <span id="avatar-label" className="text-[14px] leading-4 text-foreground">
        Avatar
      </span>
      <div className="flex min-h-[50px] flex-wrap items-center gap-y-2">
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="Seu avatar atual" width={50} height={50} className="size-[50px] rounded-full object-cover" data-testid="avatar-image" />
        ) : (
          <span className="grid size-[50px] place-items-center rounded-full border border-[#3f2319] bg-[#2f1d15]" role="img" aria-label="Sem avatar">
            <AvatarPlaceholderIcon />
          </span>
        )}
        <Button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className={cn(primaryButton, 'ml-6 px-5')}>
          {updateAvatar.isPending ? 'Enviando…' : 'Alterar'}
          <span className="sr-only"> avatar</span>
        </Button>
        <button
          type="button"
          disabled={busy || !user.avatarUrl}
          onClick={() => void onRemove()}
          className="ml-5 text-[14px] text-[#f5f1eb] hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:hover:text-[#f5f1eb] disabled:hover:no-underline"
        >
          {removeAvatar.isPending ? 'Removendo…' : 'Remover'}
          <span className="sr-only"> avatar</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={AVATAR_TYPES.join(',')}
          className="hidden"
          aria-label="Escolher imagem do avatar"
          data-testid="avatar-input"
          onChange={(e) => {
            void onFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>
      {error ? (
        <p id="avatar-error" className="flex items-center gap-1 text-[12px] text-destructive" data-testid="field-error">
          <span aria-hidden="true">⚠</span>
          {error}
        </p>
      ) : (
        <p id="avatar-hint" className="sr-only">
          PNG, JPEG ou WebP, até 1 MB.
        </p>
      )}
    </div>
  )
}

/** Ícone de imagem do Figma dentro do círculo do avatar vazio. */
function AvatarPlaceholderIcon() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="#d28a4c" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="8.5" cy="8.5" r="1.6" />
      <path d="M3.5 16.5c2.2-2.4 3.8-3.2 5.6-1.7 1.6 1.3 2.6 1.6 4.4-.6 1.7-2 3.9-2.8 7-1" />
    </svg>
  )
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

const emptyPassword: PasswordChangeInput = { currentPassword: '', newPassword: '', confirmPassword: '' }

function PasswordForm() {
  const change = useChangePassword()
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<PasswordChangeInput>({ resolver: zodResolver(PasswordChangeInput), defaultValues: emptyPassword })
  const { errors, isSubmitting, isDirty } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    try {
      await change.mutateAsync(values)
      form.reset(emptyPassword)
      notifySuccess('Senha alterada')
    } catch (e) {
      const err = e instanceof ApiError ? e : null
      if (err?.fields && applyApiFieldErrors(err.fields, form.setError, ['currentPassword', 'newPassword', 'confirmPassword'])) {
        notifyError(err.message)
        return
      }
      const msg = err?.message ?? 'Não foi possível alterar a senha'
      setFormError(msg)
      notifyError(msg)
    }
  })

  // No Figma a troca de senha não tem botão próprio: "Alterar senha" aparece quando a pessoa começa a preencher.
  const showSubmit = isDirty || isSubmitting || Boolean(formError) || Object.keys(errors).length > 0

  return (
    <form onSubmit={onSubmit} noValidate aria-labelledby="password-form-title" data-testid="password-form" className="mt-8 md:w-[calc(50%-14px)] wide:w-[calc(50%-14*var(--u))]">
      <h2 id="password-form-title" className="mb-[23px] text-[16px] font-bold leading-4 text-[#f5f1eb]">
        Alterar senha
      </h2>
      <div className="flex flex-col gap-[23px]">
        <FormField
          id="password-current"
          label="Senha atual"
          aria-required
          type="password"
          autoComplete="current-password"
          containerClassName={passwordField}
          toggleClassName={passwordToggle}
          error={errors.currentPassword?.message}
          {...form.register('currentPassword')}
        />
        <FormField
          id="password-new"
          label="Nova senha"
          aria-required
          type="password"
          autoComplete="new-password"
          containerClassName={passwordField}
          toggleClassName={passwordToggle}
          error={errors.newPassword?.message}
          {...form.register('newPassword')}
        />
        <FormField
          id="password-confirm"
          label="Confirmar nova senha"
          aria-required
          type="password"
          autoComplete="new-password"
          containerClassName={passwordField}
          toggleClassName={passwordToggle}
          error={errors.confirmPassword?.message}
          {...form.register('confirmPassword')}
        />
      </div>
      {formError && (
        <p role="alert" className="mt-4 text-[13px] text-destructive">
          {formError}
        </p>
      )}
      {showSubmit && (
        <Button
          type="submit"
          variant="outline"
          disabled={isSubmitting}
          className="mt-6 h-10 rounded-[2px] border-[#d28a4c] bg-transparent px-6 text-[14px] font-bold text-[#e89b55] hover:bg-[#d28a4c]/10 hover:text-[#e89b55]"
        >
          {isSubmitting ? 'Alterando…' : 'Alterar senha'}
        </Button>
      )}
    </form>
  )
}

const passwordField = 'gap-3'
const passwordToggle = 'right-[11px] [&_svg]:h-[13px] [&_svg]:w-4'

/**
 * Campo em carregamento: o rótulo (fixo) aparece com o mesmo espaço até o campo, e o campo vira um
 * bloco de 40px com shimmer. gap: o mesmo do campo real (perfil 17px, senha 12px, carteiras 3px).
 */
export function FieldSkeleton({ label, required = true, hideLabel, className }: { label: string; required?: boolean; hideLabel?: boolean; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <p className={cn('text-[14px] leading-4 text-foreground', hideLabel && 'sr-only')}>
        {label}
        {required && <RequiredMark />}
      </p>
      <Skeleton className="h-10 w-full rounded-[2px]" />
    </div>
  )
}

/** Perfil em carregamento: mesmos títulos, grade, avatar, troca de senha e botão do formulário carregado. */
function ProfileSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" data-testid="profile-loading">
      <p className="sr-only">Carregando perfil…</p>
      <div className="flex flex-col" aria-hidden="true">
        <p className="mb-[38px] text-[16px] font-bold leading-4 text-[#f5f1eb]">Perfil do colecionador</p>
        <div className="grid gap-x-7 gap-y-[30px] md:grid-cols-2 wide:gap-x-[calc(28*var(--u))]">
          {['Nome de exibição', 'Nome de usuário', 'E-mail', 'Nome ENS', 'Apelido da carteira'].map((label) => (
            <FieldSkeleton key={label} label={label} className={profileField} />
          ))}
          <div className="flex flex-col gap-2.5 md:-mt-[7px]">
            <span className="text-[14px] leading-4 text-foreground">Avatar</span>
            <div className="flex min-h-[50px] items-center">
              <Skeleton className="size-[50px] rounded-full" />
              <Skeleton className="ml-6 h-10 w-[99px] rounded-[2px]" />
              <Skeleton className="ml-5 h-3.5 w-[59px] rounded-sm" />
            </div>
          </div>
        </div>
        <div className="mt-8 md:w-[calc(50%-14px)] wide:w-[calc(50%-14*var(--u))]">
          <p className="mb-[23px] text-[16px] font-bold leading-4 text-[#f5f1eb]">Alterar senha</p>
          <div className="flex flex-col gap-[23px]">
            {['Senha atual', 'Nova senha', 'Confirmar nova senha'].map((label) => (
              <FieldSkeleton key={label} label={label} required={false} className={passwordField} />
            ))}
          </div>
        </div>
        <Skeleton className="mt-8 h-10 w-[131px] self-start rounded-[2px]" />
      </div>
    </div>
  )
}
