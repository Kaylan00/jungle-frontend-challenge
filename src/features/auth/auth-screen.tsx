import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { LoginInput, SignupInput } from '@/api/contracts'
import { ApiError } from '@/api/http'
import { applyApiFieldErrors, FormField } from '@/components/shared/form-field'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { HomePage } from '@/features/catalog/home-page'
import { announce } from '@/lib/announcer'
import { cn } from '@/lib/utils'
import type { AuthSearch } from './auth-search'
import { useLogin, useSession, useSignup } from './use-session'

/**
 * Login e cadastro: no Figma são uma janela sobre a página inicial (desktop) e uma tela cheia (mobile).
 * A janela é um Dialog do shadcn/ui (Radix): prende o foco dentro dela, fecha com Esc e devolve
 * o foco ao sair. Depois de entrar, volta para `redirect` (a página onde a pessoa estava).
 */
export function AuthScreen({ mode, search }: { mode: 'login' | 'signup'; search: AuthSearch }) {
  const navigate = useNavigate()
  const { user } = useSession()
  const target = search.redirect ?? '/'

  // Já autenticado (ex.: abriu /login em outra aba): segue para o destino.
  useEffect(() => {
    if (user) void navigate({ to: target, replace: true })
  }, [user, navigate, target])

  const close = () => void navigate({ to: search.redirect && !search.redirect.startsWith('/pagamento') ? search.redirect : '/', replace: true })

  return (
    <>
      <div aria-hidden="true" className="pointer-events-none hidden md:block">
        <HomePage search={{}} />
      </div>
      <Dialog open onOpenChange={(open) => !open && close()}>
        <DialogContent
          className={cn(
            'gap-0 border-border bg-card p-0 sm:max-w-[430px]',
            'max-md:inset-0 max-md:h-dvh max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:border-0',
          )}
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            document.getElementById(mode === 'login' ? 'login-email' : 'signup-username')?.focus()
          }}
        >
          <div className="flex flex-col px-6 pb-8 pt-10 max-md:justify-center max-md:pt-20 md:px-10">
            <p className="mb-10 text-center text-2xl font-bold tracking-[0.12em] md:hidden">KURIO</p>
            <nav aria-label="Entrar ou criar conta" className="flex items-center justify-center gap-2 text-lg">
              <Link
                to="/login"
                search={search}
                replace
                aria-current={mode === 'login' ? 'page' : undefined}
                className={cn(mode === 'login' ? 'text-primary' : 'text-foreground hover:text-primary')}
              >
                Entrar
              </Link>
              <span aria-hidden="true" className="h-5 w-px bg-primary/60" />
              <Link
                to="/cadastro"
                search={search}
                replace
                aria-current={mode === 'signup' ? 'page' : undefined}
                className={cn(mode === 'signup' ? 'text-primary' : 'text-foreground hover:text-primary')}
              >
                Criar conta
              </Link>
            </nav>
            <DialogTitle className="sr-only">{mode === 'login' ? 'Entrar na Kurio' : 'Criar conta na Kurio'}</DialogTitle>
            <DialogDescription className="mt-5 text-center text-[13px] text-foreground/90">
              {mode === 'login' ? 'Entre para gerenciar sua carteira, coleção e perfil de criador.' : 'Crie seu perfil de colecionador e conecte uma carteira quando quiser.'}
            </DialogDescription>
            {search.reason === 'expired' && (
              <p role="alert" className="mt-4 rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-[12px] text-warning">
                Sua sessão expirou. Entre novamente: você volta para onde estava.
              </p>
            )}
            {mode === 'login' ? <LoginForm onDone={() => void navigate({ to: target, replace: true })} /> : <SignupForm onDone={() => void navigate({ to: target, replace: true })} />}
            <SocialLogins />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function LoginForm({ onDone }: { onDone: () => void }) {
  const login = useLogin()
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<LoginInput>({ resolver: zodResolver(LoginInput), defaultValues: { email: '', password: '' } })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    try {
      const session = await login.mutateAsync(values)
      announce(`Bem-vindo, ${session.user.name}`)
      toast.success(`Bem-vindo, ${session.user.name}!`)
      onDone()
    } catch (e) {
      const err = e instanceof ApiError ? e : null
      if (err?.fields && applyApiFieldErrors(err.fields, form.setError, ['email', 'password'])) return
      setFormError(err?.message ?? 'Não foi possível entrar')
      form.setFocus('password')
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-3" aria-label="Entrar">
      <FormField id="login-email" label="E-mail" hideLabel type="email" autoComplete="email" placeholder="contato@email.com" error={errors.email?.message} {...form.register('email')} />
      <FormField id="login-password" label="Senha" hideLabel type="password" autoComplete="current-password" placeholder="Senha" error={errors.password?.message} {...form.register('password')} />
      <button type="button" className="self-end text-[13px] text-primary hover:underline" onClick={() => toast.info('Recuperação de senha não faz parte desta demonstração.')}>
        Esqueceu a senha?
      </button>
      {formError && (
        <p role="alert" className="text-[13px] text-destructive" data-testid="form-error">
          {formError}
        </p>
      )}
      <Button type="submit" disabled={isSubmitting} className="mt-2 h-11 font-semibold">
        {isSubmitting ? 'Entrando…' : 'Entrar'}
      </Button>
      <p className="mt-2 text-center text-[13px] text-muted-foreground md:hidden">
        Novo na Kurio?{' '}
        <Link to="/cadastro" className="text-primary">
          Crie uma conta
        </Link>
      </p>
    </form>
  )
}

function SignupForm({ onDone }: { onDone: () => void }) {
  const signup = useSignup()
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<SignupInput>({ resolver: zodResolver(SignupInput), defaultValues: { username: '', email: '', password: '', confirmPassword: '' } })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async ({ confirmPassword: _c, ...values }) => {
    setFormError(null)
    try {
      const session = await signup.mutateAsync(values)
      toast.success(`Conta criada. Bem-vindo, ${session.user.username}!`)
      announce('Conta criada com sucesso')
      onDone()
    } catch (e) {
      const err = e instanceof ApiError ? e : null
      // Conflito de cadastro (e-mail ou usuário já existe): erro aparece no próprio campo.
      if (err?.fields && applyApiFieldErrors(err.fields, form.setError, ['username', 'email', 'password'])) return
      setFormError(err?.message ?? 'Não foi possível criar a conta')
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-3" aria-label="Criar conta">
      <FormField id="signup-username" label="Nome de usuário" hideLabel autoComplete="username" placeholder="Nome de usuário" error={errors.username?.message} {...form.register('username')} />
      <FormField id="signup-email" label="E-mail" hideLabel type="email" autoComplete="email" placeholder="Digite seu e-mail" error={errors.email?.message} {...form.register('email')} />
      <FormField
        id="signup-password"
        label="Senha"
        hideLabel
        type="password"
        autoComplete="new-password"
        placeholder="Senha"
        hint="Mínimo de 8 caracteres, com letras e números."
        error={errors.password?.message}
        {...form.register('password')}
      />
      <FormField id="signup-confirm" label="Confirmar senha" hideLabel type="password" autoComplete="new-password" placeholder="Confirmar senha" error={errors.confirmPassword?.message} {...form.register('confirmPassword')} />
      {formError && (
        <p role="alert" className="text-[13px] text-destructive" data-testid="form-error">
          {formError}
        </p>
      )}
      <Button type="submit" disabled={isSubmitting} className="mt-2 h-11 font-semibold">
        {isSubmitting ? 'Criando conta…' : 'Criar conta'}
      </Button>
    </form>
  )
}

function SocialLogins() {
  const notAvailable = () => toast.info('Login social não faz parte desta demonstração. Use e-mail e senha.')
  return (
    <div className="mt-6">
      <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        Ou continue com
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="mt-4 flex flex-col gap-2">
        <button type="button" onClick={notAvailable} className="flex h-10 items-center justify-center gap-2 rounded-md border border-border text-[13px] hover:bg-secondary">
          <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
            <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8z" />
            <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" />
            <path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7H2.1a11 11 0 0 0 0 9.9l3.7-2.7z" />
            <path fill="#EA4335" d="M12 5.4c1.6 0 3 .6 4.2 1.6l3.1-3.1A11 11 0 0 0 2.1 7l3.7 2.9C6.7 7.3 9.1 5.4 12 5.4z" />
          </svg>
          Continuar com Google
        </button>
        <button type="button" onClick={notAvailable} className="flex h-10 items-center justify-center gap-2 rounded-md border border-border text-[13px] hover:bg-secondary">
          <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
            <path fill="#1877F2" d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12z" />
          </svg>
          Continuar com Facebook
        </button>
      </div>
    </div>
  )
}
