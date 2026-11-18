import { lazy, Suspense, useState } from 'react'
import { AuthReturnFocus, type AuthOverlay } from './auth-overlay'

// As telas de conta ficam no chunk delas (como as rotas /login e /cadastro): só carregam quando abrem.
const AuthScreen = lazy(() => import('./auth-screen').then((m) => ({ default: m.AuthScreen })))
const ForgotPasswordScreen = lazy(() => import('./forgot-password-screen').then((m) => ({ default: m.ForgotPasswordScreen })))

/**
 * Janela de conta aberta sobre a página de origem (ver auth-overlay.ts). Montada pelo RootLayout, fora do
 * <main>: a página continua montada atrás, inerte. `key` por tela: trocar entre entrar e criar conta
 * remonta a janela, como acontece entre as rotas /login e /cadastro (foco no primeiro campo de novo).
 */
export function AuthOverlayHost({ overlay }: { overlay: AuthOverlay }) {
  // Lido no primeiro render, antes de a página ficar inerte: o foco ainda está em quem abriu a janela.
  const [opener] = useState(() => {
    const active = document.activeElement
    return active instanceof HTMLElement && active !== document.body ? active : null
  })
  return (
    <AuthReturnFocus value={opener}>
      <Suspense fallback={null}>
        {overlay.mode === 'forgot' ? (
          <ForgotPasswordScreen key="forgot" search={overlay.search} />
        ) : (
          <AuthScreen key={overlay.mode} mode={overlay.mode} search={overlay.search} />
        )}
      </Suspense>
    </AuthReturnFocus>
  )
}
