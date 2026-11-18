import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { PasswordResetForm, type PasswordResetTokenInfo } from '@/api/contracts'
import { ApiError } from '@/api/http'
import { ErrorState } from '@/components/shared/error-state'
import { FormField } from '@/components/shared/form-field'
import { Button } from '@/components/ui/button'
import { DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { announce } from '@/lib/announcer'
import { applyApiFieldErrors } from '@/lib/form-errors'
import { cn } from '@/lib/utils'
import { AuthBackdrop, AuthDialog, AuthMobileBrand } from './auth-dialog'
import { authInput, authSubmit, isTouchLayout } from './auth-ui'
import { isResetLinkError, passwordResetQuery, useConfirmPasswordReset } from './use-password-reset'

const INVALID_LINK = 'Este link de redefinição não é válido. Confira o endereço ou peça um novo.'

/**
 * Página do link do e-mail (/redefinir-senha?token=...).
 * 1. Confere o token na API (GET /auth/password-reset/:token): link inválido, vencido ou já usado
 *    aparece antes de a pessoa digitar a senha nova.
 * 2. POST /auth/password-reset/confirm troca a senha. A API invalida o token e encerra as sessões.
 * 3. Sucesso: login com o aviso "Senha alterada".
 */
export function ResetPasswordScreen({ token }: { token: string | undefined }) {
  const navigate = useNavigate()
  const [linkError, setLinkError] = useState<string | null>(null)
  const check = useQuery({ ...passwordResetQuery(token ?? ''), enabled: Boolean(token) && !linkError })

  let body: React.ReactNode
  if (!token) body = <InvalidLink message={INVALID_LINK} />
  else if (linkError) body = <InvalidLink message={linkError} />
  else if (check.isPending) {
    body = (
      <p role="status" className="mt-8 flex items-center justify-center gap-2 text-[13px] text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Conferindo o link…
      </p>
    )
  } else if (check.isError) {
    body = isResetLinkError(check.error) ? (
      <InvalidLink message={check.error.message} />
    ) : (
      <ErrorState
        className="mt-6 border-[#3f2319] bg-transparent py-8"
        title="Não foi possível conferir o link"
        message={check.error instanceof ApiError ? check.error.message : undefined}
        onRetry={() => void check.refetch()}
        retrying={check.isFetching}
      />
    )
  } else {
    body = (
      <ResetForm
        token={token}
        info={check.data}
        onLinkError={setLinkError}
        onDone={() => void navigate({ to: '/login', search: { reason: 'password-reset' }, replace: true })}
      />
    )
  }

  return (
    <>
      <AuthBackdrop />
      <AuthDialog
        onClose={() => void navigate({ to: '/', replace: true })}
        className={cn(
          'min-h-[480px] [@media(min-height:860px)]:md:top-[160px] [@media(min-height:860px)]:md:translate-y-0',
          // Tela baixa no desktop: a janela rola em vez de sair da tela.
          'md:max-h-[calc(100dvh-2rem)] md:overflow-y-auto [@media(min-height:860px)]:md:max-h-[calc(100dvh-176px)]',
        )}
      >
        <div className="flex flex-col px-6 pb-8 pt-[46px] max-md:px-7 max-md:pt-[127px] md:px-20">
          <AuthMobileBrand />
          <DialogTitle className="text-center text-[20px] font-normal leading-6 text-[#e89b55] max-md:mt-[79px] max-md:font-bold max-md:text-foreground">
            Criar nova senha
          </DialogTitle>
          <DialogDescription className="mt-6 text-center text-[13px] leading-5 text-[#f5f1eb] md:-mx-[36px]">
            Escolha uma senha nova para a sua conta. Depois de salvar, entre com ela.
          </DialogDescription>
          {body}
        </div>
      </AuthDialog>
    </>
  )
}

/** Link que não serve mais: diz o motivo (vindo da API) e oferece pedir outro. */
function InvalidLink({ message }: { message: string }) {
  const ref = useRef<HTMLDivElement>(null)
  // O formulário pode ter sumido com o foco dentro: o foco vai para o aviso, ainda dentro da janela.
  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
  }, [])

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div
        ref={ref}
        tabIndex={-1}
        role="alert"
        data-testid="reset-link-error"
        className="rounded-[4px] border border-destructive/50 bg-destructive/10 px-4 py-3 text-[13px] leading-5 text-[#f5f1eb] outline-none max-md:rounded-[10px]"
      >
        <span aria-hidden="true" className="mr-1 text-destructive">
          ⚠
        </span>
        {message}
      </div>
      <Button asChild className={authSubmit}>
        <Link to="/recuperar-senha" replace>
          Pedir um novo link
        </Link>
      </Button>
    </div>
  )
}

function ResetForm({
  token,
  info,
  onLinkError,
  onDone,
}: {
  token: string
  info: PasswordResetTokenInfo
  onLinkError: (message: string) => void
  onDone: () => void
}) {
  const confirm = useConfirmPasswordReset()
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<PasswordResetForm>({ resolver: zodResolver(PasswordResetForm), defaultValues: { password: '', confirmPassword: '' } })
  const { errors, isSubmitting } = form.formState

  // Desktop: o formulário aparece depois de conferir o link; o foco vai para a senha nova.
  // Toque/mobile: não foca campo (abriria o teclado sem a pessoa pedir).
  useEffect(() => {
    if (!isTouchLayout()) form.setFocus('password')
  }, [form])

  const onSubmit = form.handleSubmit(async ({ password }) => {
    setFormError(null)
    try {
      const res = await confirm.mutateAsync({ token, password })
      announce(res.message, 'assertive')
      toast.success('Senha alterada')
      onDone()
    } catch (e) {
      if (isResetLinkError(e)) return onLinkError(e.message)
      const err = e instanceof ApiError ? e : null
      if (err?.fields && applyApiFieldErrors(err.fields, form.setError, ['password'])) return
      setFormError(err?.isTransient ? `${err.message} Sua senha não foi alterada; tente novamente.` : (err?.message ?? 'Não foi possível alterar a senha'))
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="mt-[25px] flex flex-col max-md:mt-[32px]" aria-label="Criar nova senha">
      <p className="mb-4 text-center text-[13px] text-muted-foreground" data-testid="reset-account">
        Conta: <span className="text-foreground">{info.email}</span>
      </p>
      <div className="flex flex-col gap-3">
        <FormField
          id="reset-password"
          label="Nova senha"
          type="password"
          autoComplete="new-password"
          placeholder="Nova senha"
          className={authInput}
          toggleClassName="right-[7px]"
          hint="Pelo menos 8 caracteres, com letras e números."
          error={errors.password?.message}
          {...form.register('password')}
        />
        <FormField
          id="reset-confirm"
          label="Confirmar nova senha"
          type="password"
          autoComplete="new-password"
          placeholder="Repita a nova senha"
          className={authInput}
          toggleClassName="right-[7px]"
          error={errors.confirmPassword?.message}
          {...form.register('confirmPassword')}
        />
      </div>
      {formError && (
        <p role="alert" className="mt-3 text-[13px] text-destructive" data-testid="form-error">
          {formError}
        </p>
      )}
      <Button type="submit" disabled={isSubmitting} className={cn('mt-6 max-md:mt-8', authSubmit)}>
        {isSubmitting ? 'Salvando…' : formError ? 'Tentar novamente' : 'Salvar nova senha'}
      </Button>
    </form>
  )
}
