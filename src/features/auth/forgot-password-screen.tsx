import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from '@tanstack/react-router'
import { MailCheck } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { PasswordResetRequest } from '@/api/contracts'
import { ApiError } from '@/api/http'
import { applyApiFieldErrors, FormField } from '@/components/shared/form-field'
import { Button } from '@/components/ui/button'
import { DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { announce } from '@/lib/announcer'
import { cn } from '@/lib/utils'
import { AuthBackdrop, AuthDialog, AuthMobileBrand } from './auth-dialog'
import { authInput, authSubmit } from './auth-ui'
import { closeTarget, type AuthSearch } from './auth-search'
import { useRequestPasswordReset } from './use-password-reset'

/**
 * Atalho para a caixa de saída do servidor de e-mail simulado. Só existe com os mocks ligados
 * (demonstração): sem a flag, nem entra no bundle, como o painel de cenários.
 */
const SimulatedInboxLink = import.meta.env.VITE_ENABLE_MOCKS === 'true' ? lazy(() => import('@/mocks/simulated-inbox-link')) : null

/**
 * "Esqueceu a senha?": pede o link de redefinição por e-mail (POST /auth/password-reset).
 * A API responde sempre a mesma coisa, exista ou não a conta, e a tela repete essa mensagem neutra.
 */
export function ForgotPasswordScreen({ search }: { search: AuthSearch }) {
  const navigate = useNavigate()
  const [sent, setSent] = useState<{ email: string; message: string } | null>(null)
  const [email, setEmail] = useState('')
  const close = () => void navigate({ to: closeTarget(search.redirect), replace: true })

  return (
    <>
      <AuthBackdrop />
      <AuthDialog
        onClose={close}
        initialFocusId="forgot-email"
        className={cn(
          'min-h-[480px] [@media(min-height:860px)]:md:top-[160px] [@media(min-height:860px)]:md:translate-y-0',
          // Tela baixa no desktop: a janela rola em vez de sair da tela.
          'md:max-h-[calc(100dvh-2rem)] md:overflow-y-auto [@media(min-height:860px)]:md:max-h-[calc(100dvh-176px)]',
        )}
      >
        <div className="flex flex-col px-6 pb-8 pt-[46px] max-md:px-7 max-md:pt-[127px] md:px-20">
          <AuthMobileBrand />
          <DialogTitle className="text-center text-[20px] font-normal leading-6 text-[#e89b55] max-md:mt-[79px] max-md:font-bold max-md:text-foreground">
            Recuperar senha
          </DialogTitle>
          <DialogDescription className="mt-6 text-center text-[13px] leading-5 text-[#f5f1eb] md:-mx-[36px]">
            Informe o e-mail da sua conta. Enviaremos um link para você criar uma senha nova.
          </DialogDescription>

          {sent ? (
            <SentNotice email={sent.email} message={sent.message} />
          ) : (
            <ForgotForm
              defaultEmail={email}
              onSent={(v) => {
                setEmail(v.email)
                setSent(v)
              }}
            />
          )}

          <p className="mt-8 text-center text-[14px] leading-5 text-muted-foreground max-md:mt-10 md:-mx-[36px]">
            {sent ? (
              <>
                Não chegou?{' '}
                <button type="button" onClick={() => setSent(null)} className="text-[#e89b55] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  Pedir de novo
                </button>
                <span aria-hidden="true"> · </span>
              </>
            ) : (
              'Lembrou a senha? '
            )}
            <Link to="/login" search={{ redirect: search.redirect }} replace className="text-[#e89b55] hover:underline">
              Voltar para o login
            </Link>
          </p>
        </div>
      </AuthDialog>
    </>
  )
}

function ForgotForm({ defaultEmail, onSent }: { defaultEmail: string; onSent: (v: { email: string; message: string }) => void }) {
  const request = useRequestPasswordReset()
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<PasswordResetRequest>({ resolver: zodResolver(PasswordResetRequest), defaultValues: { email: defaultEmail } })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    try {
      const res = await request.mutateAsync(values)
      announce(res.message)
      onSent({ email: values.email, message: res.message })
    } catch (e) {
      const err = e instanceof ApiError ? e : null
      if (err?.fields && applyApiFieldErrors(err.fields, form.setError, ['email'])) return
      // Rede, timeout ou 5xx: mesma mensagem do resto do app e o botão vira "Tentar novamente".
      setFormError(err?.isTransient ? `${err.message} Confira sua conexão e tente novamente.` : (err?.message ?? 'Não foi possível enviar o link'))
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="mt-[25px] flex flex-col max-md:mt-[32px]" aria-label="Recuperar senha">
      <FormField
        id="forgot-email"
        label="E-mail da conta"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="contato@email.com"
        className={authInput}
        error={errors.email?.message}
        {...form.register('email')}
      />
      {formError && (
        <p role="alert" className="mt-3 text-[13px] text-destructive" data-testid="form-error">
          {formError}
        </p>
      )}
      <Button type="submit" disabled={isSubmitting} className={cn('mt-6 max-md:mt-8', authSubmit)}>
        {isSubmitting ? 'Enviando…' : formError ? 'Tentar novamente' : 'Enviar link'}
      </Button>
    </form>
  )
}

function SentNotice({ email, message }: { email: string; message: string }) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  // O formulário some: o foco vai para o título do resultado (a mensagem já foi anunciada).
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
  }, [])

  return (
    <div className="mt-[25px] flex flex-col gap-3 max-md:mt-[32px] max-md:gap-4" data-testid="password-reset-sent">
      <div className="flex flex-col gap-2 rounded-[4px] border border-[#3f2319] px-4 py-4 max-md:rounded-[10px]">
        <h2 ref={headingRef} tabIndex={-1} className="flex items-center gap-2 text-[15px] font-bold leading-6 outline-none">
          <MailCheck className="size-5 shrink-0 text-[#e89b55]" aria-hidden="true" />
          Confira seu e-mail
        </h2>
        <p className="text-[13px] leading-5 text-[#f5f1eb]">{message}</p>
        <p className="text-[12px] leading-5 text-muted-foreground">
          Endereço informado: <span className="break-all text-foreground">{email}</span>. Veja também a caixa de spam.
        </p>
      </div>
      {SimulatedInboxLink && (
        <Suspense fallback={null}>
          <SimulatedInboxLink email={email} />
        </Suspense>
      )}
    </div>
  )
}
