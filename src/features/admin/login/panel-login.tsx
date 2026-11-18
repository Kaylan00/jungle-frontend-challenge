/**
 * ENTRADA do Kurio Admin (/admin/entrar): a porta da equipe, separada do login da loja.
 *
 * Mesma API de autenticação (POST /auth/login), mas a sessão só vale aqui depois que GET /admin/me confirma o
 * papel. Conta comum recebe o 403 da API e a mensagem dele aparece na tela; a sessão que o login criou é
 * encerrada no servidor (ver useAdminLogin). Os campos ficam controlados pelo formulário: erro de senha não
 * apaga o que foi digitado.
 */
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { ArrowLeft, LockKeyhole, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { LoginInput } from '@/api/contracts'
import { ApiError } from '@/api/http'
import { FormField } from '@/components/shared/form-field'
import { applyApiFieldErrors } from '@/lib/form-errors'
import { cn } from '@/lib/utils'
import type { PanelAccess } from '../access'
import { useAdminLogin } from '../hooks'
import '../shell/panel.css'

const fieldClass = 'h-11 rounded-[10px] border-[var(--kp-linha-forte)] bg-[var(--kp-ficha)] px-3.5 focus-visible:border-[var(--kp-laranja)]'

export function PanelLogin({ redirectTo, reason, access }: { redirectTo?: string; reason?: 'sem-permissao' | 'expirada' | 'saiu'; access: PanelAccess }) {
  const navigate = useNavigate()
  const login = useAdminLogin()
  const [forbidden, setForbidden] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const { register, handleSubmit, setError, formState } = useForm<LoginInput>({ resolver: zodResolver(LoginInput), defaultValues: { email: '', password: '' } })

  const submit = handleSubmit((values) => {
    setForbidden(null)
    setFormError(null)
    login.mutate(values, {
      onSuccess: () => void navigate({ href: redirectTo ?? '/admin', replace: true }),
      onError: (error) => {
        if (error instanceof ApiError && error.code === 'FORBIDDEN') return setForbidden(error.message)
        if (error instanceof ApiError && applyApiFieldErrors(error.fields, setError, ['email', 'password'])) return
        setFormError(error instanceof ApiError ? error.message : 'Não foi possível entrar. Tente novamente.')
      },
    })
  })

  const signedInAs = access.status === 'forbidden' ? access : null

  return (
    <div className="kpanel relative grid min-h-dvh place-items-center overflow-hidden px-4 py-12" data-testid="panel-login">
      {/* Fundo: a mesa com um brilho de cobre e uma grade fina, só decoração. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(60% 50% at 50% 0%, rgb(210 138 76 / 0.16), transparent 70%), linear-gradient(rgb(245 241 235 / 0.025) 1px, transparent 1px) 0 0 / 100% 48px, linear-gradient(90deg, rgb(245 241 235 / 0.025) 1px, transparent 1px) 0 0 / 48px 100%',
        }}
      />

      <main id="conteudo" tabIndex={-1} className="kp-entra relative z-10 w-full max-w-[440px] outline-none">
        <div className="mb-7 flex items-center justify-center gap-3">
          <span aria-hidden="true" className="grid size-11 place-items-center rounded-[12px] bg-[var(--kp-laranja)] text-[19px] font-black text-[#140d0a]">
            K
          </span>
          <span className="leading-tight">
            <span className="block text-[18px] font-bold tracking-[0.14em]">KURIO</span>
            <span className="block text-[11px] font-semibold uppercase tracking-[0.26em] text-[var(--kp-laranja-texto)]">Admin</span>
          </span>
        </div>

        <section aria-labelledby="panel-login-title" className="kp-lousa rounded-[20px] px-6 pb-7 pt-7 sm:px-8">
          <p className="kp-rotulo flex items-center gap-2">
            <LockKeyhole className="size-3.5" aria-hidden="true" />
            Acesso da equipe
          </p>
          <h1 id="panel-login-title" className="mt-2 text-[24px] font-bold leading-tight">
            Entrar no painel
          </h1>
          <p className="mt-1.5 text-[13px] leading-5 text-[var(--kp-grafite)]">Catálogo, preços, cupons e pedidos da Kurio. Só contas de administrador passam daqui.</p>

          {reason === 'sem-permissao' && signedInAs && !forbidden && (
            <div role="status" className="mt-5 flex gap-3 rounded-[12px] border border-warning/40 bg-warning/10 p-3.5 text-[13px] leading-5" data-testid="panel-login-notice">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
              <p>
                {signedInAs.message} Você está conectado como <strong>@{signedInAs.user.username}</strong>. Entrar aqui com uma conta da equipe troca a conta conectada neste
                navegador (a loja usa a mesma sessão).
              </p>
            </div>
          )}
          {reason === 'expirada' && (
            <p role="status" className="mt-5 rounded-[12px] border border-[var(--kp-linha-forte)] bg-white/[0.03] p-3.5 text-[13px] leading-5" data-testid="panel-login-notice">
              Sua sessão expirou. Entre de novo para continuar de onde parou.
            </p>
          )}
          {reason === 'saiu' && !signedInAs && (
            <p role="status" className="mt-5 rounded-[12px] border border-[var(--kp-linha-forte)] bg-white/[0.03] p-3.5 text-[13px] leading-5" data-testid="panel-login-notice">
              Você saiu do painel. A sessão deste navegador foi encerrada.
            </p>
          )}

          {forbidden && (
            <div role="alert" className="mt-5 flex gap-3 rounded-[12px] border border-destructive/50 bg-destructive/10 p-3.5 text-[13px] leading-5" data-testid="panel-login-forbidden">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
              <div>
                <p className="font-semibold">Sem permissão (403)</p>
                <p className="mt-0.5 text-[var(--kp-grafite)]">{forbidden} Use uma conta da equipe. Sua conta continua valendo na loja.</p>
              </div>
            </div>
          )}

          <form onSubmit={submit} noValidate className="mt-6 flex flex-col gap-4">
            <FormField
              label="E-mail"
              type="email"
              autoComplete="username"
              autoFocus
              className={fieldClass}
              error={formState.errors.email?.message}
              {...register('email')}
            />
            <FormField
              label="Senha"
              type="password"
              autoComplete="current-password"
              className={fieldClass}
              error={formState.errors.password?.message}
              {...register('password')}
            />
            {formError && (
              <p role="alert" className="text-[13px] text-destructive" data-testid="panel-login-error">
                {formError}
              </p>
            )}
            <button
              type="submit"
              disabled={login.isPending}
              className={cn(
                'mt-1 h-11 rounded-[10px] bg-[var(--kp-laranja)] text-[14px] font-bold text-[#140d0a] transition-colors hover:bg-[#df9a5e] disabled:opacity-60',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kp-laranja)]',
              )}
            >
              {login.isPending ? 'Conferindo acesso…' : 'Entrar'}
            </button>
          </form>
        </section>

        <a href="/" className="mx-auto mt-6 flex w-fit items-center gap-2 rounded-md px-2 py-1 text-[13px] text-[var(--kp-grafite)] transition-colors hover:text-[var(--kp-tinta)]">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Voltar para a loja
        </a>
      </main>
    </div>
  )
}
