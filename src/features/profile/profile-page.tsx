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
import { UserRound } from 'lucide-react'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { PasswordChangeInput, ProfileInput, type User } from '@/api/contracts'
import { ApiError } from '@/api/http'
import { ErrorState } from '@/components/shared/error-state'
import { applyApiFieldErrors, FormField } from '@/components/shared/form-field'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
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
        <div className="flex flex-col gap-10">
          <ProfileForm user={profile.data} />
          <PasswordForm />
        </div>
      )}
    </ProfileLayout>
  )
}

function toProfileInput(user: User): ProfileInput {
  return { name: user.name, username: user.username, email: user.email, ensName: user.ensName, walletNickname: user.walletNickname }
}

const profileFields = ['name', 'username', 'email', 'ensName', 'walletNickname'] as const

function ProfileForm({ user }: { user: User }) {
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
    <form onSubmit={onSubmit} noValidate aria-labelledby="profile-form-title" data-testid="profile-form">
      <h2 id="profile-form-title" className="mb-5 text-[14px] font-bold">
        Perfil do colecionador
      </h2>
      <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
        <FormField id="profile-name" label="Nome de exibição" required autoComplete="name" error={errors.name?.message} {...form.register('name')} />
        <FormField id="profile-username" label="Nome de usuário" required autoComplete="username" error={errors.username?.message} {...form.register('username')} />
        <FormField id="profile-email" label="E-mail" required type="email" autoComplete="email" error={errors.email?.message} {...form.register('email')} />
        <FormField
          id="profile-ens"
          label="Nome ENS"
          required
          autoComplete="off"
          prefix={<EnsSuffix />}
          className="rounded-l-none"
          error={errors.ensName?.message}
          {...form.register('ensName')}
        />
        <FormField id="profile-wallet-nickname" label="Apelido da carteira" required error={errors.walletNickname?.message} {...form.register('walletNickname')} />
        <AvatarField user={user} />
      </div>
      {formError && (
        <p role="alert" className="mt-4 text-[13px] text-destructive" data-testid="form-error">
          {formError}
        </p>
      )}
      <Button type="submit" disabled={isSubmitting} className="mt-6 h-10 min-w-32 font-semibold">
        {isSubmitting ? 'Salvando…' : 'Salvar'}
      </Button>
    </form>
  )
}

/** Caixa fixa ".eth" à esquerda do campo: o valor salvo é só o nome. */
export function EnsSuffix() {
  return (
    <span className="flex h-10 shrink-0 items-center rounded-l-md border border-r-0 border-input bg-secondary px-3 text-[13px] text-foreground">.eth</span>
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
    <div className="flex flex-col gap-1.5" role="group" aria-labelledby="avatar-label" aria-describedby={error ? 'avatar-error' : undefined}>
      <span id="avatar-label" className="text-[13px] font-medium">
        Avatar
      </span>
      <div className="flex h-10 items-center gap-3">
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="Seu avatar atual" width={40} height={40} className="size-10 rounded-full object-cover" data-testid="avatar-image" />
        ) : (
          <span className="grid size-10 place-items-center rounded-full bg-secondary" role="img" aria-label="Sem avatar">
            <UserRound className="size-5 text-muted-foreground" aria-hidden="true" />
          </span>
        )}
        <Button type="button" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
          {updateAvatar.isPending ? 'Enviando…' : 'Alterar'}
          <span className="sr-only"> avatar</span>
        </Button>
        {user.avatarUrl && (
          <Button type="button" size="sm" variant="link" disabled={busy} onClick={() => void onRemove()} className="px-1">
            {removeAvatar.isPending ? 'Removendo…' : 'Remover'}
            <span className="sr-only"> avatar</span>
          </Button>
        )}
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
        <p className="text-[12px] text-muted-foreground">PNG, JPEG ou WebP, até 1 MB.</p>
      )}
    </div>
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
  const { errors, isSubmitting } = form.formState

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

  return (
    <form onSubmit={onSubmit} noValidate aria-labelledby="password-form-title" data-testid="password-form">
      <h2 id="password-form-title" className="mb-5 text-[14px] font-bold">
        Alterar senha
      </h2>
      <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
        <FormField
          id="password-current"
          label="Senha atual"
          required
          type="password"
          autoComplete="current-password"
          error={errors.currentPassword?.message}
          {...form.register('currentPassword')}
        />
        <FormField
          id="password-new"
          label="Nova senha"
          required
          type="password"
          autoComplete="new-password"
          hint="Mínimo de 8 caracteres, com letras e números."
          error={errors.newPassword?.message}
          containerClassName="md:col-start-1"
          {...form.register('newPassword')}
        />
        <FormField
          id="password-confirm"
          label="Confirmar nova senha"
          required
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...form.register('confirmPassword')}
        />
      </div>
      {formError && (
        <p role="alert" className="mt-4 text-[13px] text-destructive">
          {formError}
        </p>
      )}
      <Button type="submit" variant="outline" disabled={isSubmitting} className="mt-6 h-10 min-w-32 border-primary font-semibold text-primary">
        {isSubmitting ? 'Alterando…' : 'Alterar senha'}
      </Button>
    </form>
  )
}

function ProfileSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <p className="sr-only">Carregando perfil…</p>
      <Skeleton className="mb-5 h-5 w-48" />
      <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Skeleton className="h-[19px] w-32" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
      <Skeleton className="mt-6 h-10 w-32" />
      <Skeleton className="mb-5 mt-10 h-5 w-36" />
      <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className={i === 1 ? 'flex flex-col gap-1.5 md:col-start-1' : 'flex flex-col gap-1.5'}>
            <Skeleton className="h-[19px] w-32" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
