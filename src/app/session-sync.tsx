/**
 * Reage às trocas de sessão (login, logout, expiração, outra aba):
 *  - remove do cache tudo que é privado da sessão anterior (['private', ...]);
 *  - atualiza a consulta de sessão;
 *  - na expiração, leva para o login guardando a página atual para retomar depois.
 * O socket reage à mesma troca por conta própria (RealtimeClient.restart).
 */
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { qk } from '@/api/queries'
import { sessionStore } from '@/api/session-store'
import { authNavigation, readAuthOverlay } from '@/features/auth/auth-overlay'
import { announce } from '@/lib/announcer'
import type { createAppRouter } from './router'

export function SessionSync({ router }: { router: ReturnType<typeof createAppRouter> }) {
  const queryClient = useQueryClient()

  useEffect(() => {
    return sessionStore.subscribe(({ reason }) => {
      if (reason === 'login') return // o fluxo de login cuida do cache
      queryClient.removeQueries({ queryKey: qk.private })
      queryClient.setQueryData(qk.session, null)
      if (reason === 'expired') {
        const message = 'Sua sessão expirou. Entre novamente para continuar de onde parou.'
        toast.warning(message, { id: 'session-expired' })
        announce(message, 'assertive')
        const location = router.state.location
        // Já está numa tela de conta (rota ou janela sobre a página): só o aviso.
        if (!/^\/(login|cadastro)/.test(location.pathname) && !readAuthOverlay(location)) {
          // Página pública: login por cima dela. Privada (ex.: pagamento): rota /login; o rascunho do formulário fica salvo.
          void router.navigate(authNavigation(location, 'login', { redirect: location.href, reason: 'expired' }))
        }
      } else {
        void router.invalidate()
      }
    })
  }, [queryClient, router])

  return null
}
