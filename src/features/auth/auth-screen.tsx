import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { LoginInput, SignupInput } from '@/api/contracts'
import { ApiError } from '@/api/http'
import { applyApiFieldErrors, FormField } from '@/components/shared/form-field'
import { Button } from '@/components/ui/button'
import { DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { announce } from '@/lib/announcer'
import { cn } from '@/lib/utils'
import { AuthBackdrop, AuthDialog, AuthMobileBrand } from './auth-dialog'
import { authInput, authSubmit } from './auth-ui'
import { closeTarget, type AuthSearch } from './auth-search'
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

  // Fechar volta para a página de origem (ou para o início, se ela exigir login).
  const close = () => void navigate({ to: closeTarget(search.redirect), replace: true })

  const isLogin = mode === 'login'

  return (
    <>
      <AuthBackdrop />
      <AuthDialog
        onClose={close}
        // Desktop: foco no primeiro campo. Toque/mobile: foco na própria janela (sem abrir o teclado).
        initialFocusId={isLogin ? 'login-email' : 'signup-username'}
        className={cn(
          isLogin ? 'min-h-[600px]' : 'min-h-[656px] rounded-[8px]',
          // Telas altas: mesma posição do Figma (janela a 160px do topo); telas baixas: centralizada.
          isLogin ? '[@media(min-height:860px)]:md:top-[160px]' : '[@media(min-height:860px)]:md:top-[158px]',
          '[@media(min-height:860px)]:md:translate-y-0',
        )}
        closeClassName={isLogin ? undefined : 'top-[11px]'}
      >
        <div className="flex flex-col px-6 pb-8 pt-[46px] max-md:px-7 max-md:pt-[127px] md:px-20">
          {/* Mobile: marca grande e título da tela no lugar das abas e do texto de apoio. */}
          <AuthMobileBrand />
          <p aria-hidden="true" className={cn('text-center font-bold leading-6 md:hidden', isLogin ? 'mt-[79px] text-[20px]' : 'mt-[80px] text-[18px]')}>
            {isLogin ? 'Entrar' : 'Criar perfil de colecionador'}
          </p>
          <nav aria-label="Entrar ou criar conta" className="flex items-center justify-center gap-2 text-[20px] leading-6 max-md:hidden">
            <Link
              to="/login"
              search={search}
              replace
              aria-current={isLogin ? 'page' : undefined}
              className={cn(isLogin ? 'text-[#e89b55]' : 'text-[#f5f1eb] hover:text-[#e89b55]')}
            >
              Entrar
            </Link>
            <span aria-hidden="true" className="h-5 w-px bg-[#8a4b38]" />
            <Link
              to="/cadastro"
              search={search}
              replace
              aria-current={!isLogin ? 'page' : undefined}
              className={cn(!isLogin ? 'text-[#e89b55]' : 'text-[#f5f1eb] hover:text-[#e89b55]')}
            >
              Criar conta
            </Link>
          </nav>
          <DialogTitle className="sr-only">{isLogin ? 'Entrar na Kurio' : 'Criar conta na Kurio'}</DialogTitle>
          <DialogDescription className="mt-[37px] text-center text-[13px] leading-4 text-[#f5f1eb] max-md:sr-only md:-mx-[36px]">
            {isLogin ? 'Entre para gerenciar sua carteira, coleção e perfil de criador.' : 'Crie seu perfil de colecionador e conecte uma carteira quando quiser.'}
          </DialogDescription>
          {search.reason === 'expired' && (
            <p role="alert" className="mt-4 rounded-[4px] border border-warning/50 bg-warning/10 px-3 py-2 text-[12px] text-warning">
              Sua sessão expirou. Entre novamente: você volta para onde estava.
            </p>
          )}
          {search.reason === 'password-reset' && isLogin && (
            <p role="status" data-testid="password-reset-notice" className="mt-4 rounded-[4px] border border-success/50 bg-success/10 px-3 py-2 text-[12px] text-success">
              Senha alterada. Entre com a senha nova.
            </p>
          )}
          {isLogin ? (
            <LoginForm search={search} onDone={() => void navigate({ to: target, replace: true })} />
          ) : (
            <SignupForm onDone={() => void navigate({ to: target, replace: true })} />
          )}
          <SocialLogins roomy={!isLogin} />
          <p className="mt-[41px] text-center text-[15px] leading-5 text-muted-foreground md:hidden">
            {isLogin ? 'Novo na Kurio? ' : 'Já tem uma conta? '}
            <Link to={isLogin ? '/cadastro' : '/login'} search={search} replace className="hover:text-highlight hover:underline">
              {isLogin ? 'Crie uma conta' : 'Entre'}
            </Link>
          </p>
        </div>
      </AuthDialog>
    </>
  )
}

function LoginForm({ onDone, search }: { onDone: () => void; search: AuthSearch }) {
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
    <form onSubmit={onSubmit} noValidate className="mt-[25px] flex flex-col max-md:mt-[32px]" aria-label="Entrar">
      <div className="flex flex-col gap-3">
        <FormField id="login-email" label="E-mail" hideLabel type="email" autoComplete="email" placeholder="contato@email.com" className={authInput} error={errors.email?.message} {...form.register('email')} />
        <FormField
          id="login-password"
          label="Senha"
          hideLabel
          type="password"
          autoComplete="current-password"
          placeholder="Senha"
          className={authInput}
          toggleClassName="right-[7px]"
          error={errors.password?.message}
          {...form.register('password')}
        />
      </div>
      <Link
        to="/recuperar-senha"
        search={{ redirect: search.redirect }}
        replace
        className="mt-[10px] self-end text-[14px] leading-5 text-[#e89b55] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Esqueceu a senha?
      </Link>
      {formError && (
        <p role="alert" className="mt-3 text-[13px] text-destructive" data-testid="form-error">
          {formError}
        </p>
      )}
      <Button type="submit" disabled={isSubmitting} className={cn('mt-[22px] max-md:mt-[38px]', authSubmit)}>
        {isSubmitting ? 'Entrando…' : 'Entrar'}
      </Button>
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
    <form onSubmit={onSubmit} noValidate className="mt-[25px] flex flex-col max-md:mt-[34px]" aria-label="Criar conta">
      <div className="flex flex-col gap-3">
        <FormField id="signup-username" label="Nome de usuário" hideLabel autoComplete="username" placeholder="Nome de usuário" className={authInput} error={errors.username?.message} {...form.register('username')} />
        <FormField id="signup-email" label="E-mail" hideLabel type="email" autoComplete="email" placeholder="Digite seu e-mail" className={authInput} error={errors.email?.message} {...form.register('email')} />
        <FormField
          id="signup-password"
          label="Senha"
          hideLabel
          type="password"
          autoComplete="new-password"
          placeholder="Senha"
          className={authInput}
          toggleClassName="right-[7px]"
          error={errors.password?.message}
          {...form.register('password')}
        />
        <FormField
          id="signup-confirm"
          label="Confirmar senha"
          hideLabel
          type="password"
          autoComplete="new-password"
          placeholder="Confirmar senha"
          className={cn(authInput, 'md:pr-4')}
          toggleClassName="right-[7px] md:hidden"
          error={errors.confirmPassword?.message}
          {...form.register('confirmPassword')}
        />
      </div>
      {formError && (
        <p role="alert" className="mt-3 text-[13px] text-destructive" data-testid="form-error">
          {formError}
        </p>
      )}
      {/* Mobile: o Figma escreve "Criar perfil"; o nome acessível continua "Criar conta". */}
      <Button type="submit" disabled={isSubmitting} className={cn('mt-6 max-md:mt-10', authSubmit)} aria-label={isSubmitting ? undefined : 'Criar conta'}>
        {isSubmitting ? (
          'Criando conta…'
        ) : (
          <>
            <span className="max-md:hidden">Criar conta</span>
            <span className="md:hidden">Criar perfil</span>
          </>
        )}
      </Button>
    </form>
  )
}

function SocialLogins({ roomy }: { roomy?: boolean }) {
  const notAvailable = () => toast.info('Login social não faz parte desta demonstração. Use e-mail e senha.')
  const social =
    'flex h-10 items-center justify-center gap-3 rounded-[4px] border border-[#3f2319] text-[13px] text-[#cfb28c] hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:bg-[#170e0b] max-md:pr-[17px]'
  return (
    <div className="mt-6 max-md:mt-[41px]">
      <div className="-mx-6 flex items-center gap-3 text-[13px] leading-4 text-[#f5f1eb] max-md:mx-0 md:-mx-20">
        <span aria-hidden="true" className="h-px flex-1 bg-[#3f2319]" />
        Ou continue com
        <span aria-hidden="true" className="h-px flex-1 bg-[#3f2319]" />
      </div>
      <div className={cn('flex flex-col max-md:mt-[11px] max-md:gap-4', roomy ? 'mt-4 gap-4' : 'mt-3 gap-3')}>
        <button type="button" onClick={notAvailable} className={social}>
          <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
            <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8z" />
            <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" />
            <path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7H2.1a11 11 0 0 0 0 9.9l3.7-2.7z" />
            <path fill="#EA4335" d="M12 5.4c1.6 0 3 .6 4.2 1.6l3.1-3.1A11 11 0 0 0 2.1 7l3.7 2.9C6.7 7.3 9.1 5.4 12 5.4z" />
          </svg>
          Continuar com Google
        </button>
        <button type="button" onClick={notAvailable} className={social}>
          <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
            <path fill="#3b5999" d="M11.6 20v-9.1h3.1l.5-3.6h-3.6V5c0-1 .3-1.7 1.8-1.7h1.9V.1C15 .1 13.9 0 12.6 0 9.9 0 8 1.7 8 4.7v2.6H4.9v3.6H8V20h3.6z" />
          </svg>
          Continuar com Facebook
        </button>
      </div>
    </div>
  )
}
