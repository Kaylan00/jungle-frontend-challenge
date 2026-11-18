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
import { isPanelPath } from '@/features/admin/panel-path'
import { clearPriceDrops } from '@/features/favorites/price-drops'
import { announce } from '@/lib/announcer'
import type { createAppRouter } from './router'

export function SessionSync({ router }: { router: ReturnType<typeof createAppRouter> }) {
  const queryClient = useQueryClient()

  useEffect(() => {
    return sessionStore.subscribe(({ reason }) => {
      // Selos de "Preço caiu" são da conta que estava logada: nada passa para a próxima.
      clearPriceDrops()
      const onPanel = isPanelPath(router.state.location.pathname)
      if (reason === 'login') {
        // Kurio Admin: outra aba pode ter entrado com outra conta (a sessão é uma só por navegador). A sessão é
        // relida e o guard do painel confere o papel de novo (conta comum vai para a entrada, com o aviso).
        if (onPanel) void queryClient.invalidateQueries({ queryKey: qk.session }).then(() => router.invalidate())
        return // na loja, o fluxo de login cuida do cache
      }
      queryClient.removeQueries({ queryKey: qk.private })
      queryClient.setQueryData(qk.session, null)
      if (reason === 'expired') {
        const message = 'Sua sessão expirou. Entre novamente para continuar de onde parou.'
        toast.warning(message, { id: 'session-expired' })
        announce(message, 'assertive')
        const location = router.state.location
        if (isPanelPath(location.pathname)) {
          // Kurio Admin: entrada própria do painel, guardando onde estava.
          if (location.pathname !== '/admin/entrar') {
            void router.navigate({ to: '/admin/entrar', search: { redirect: location.href, motivo: 'expirada' }, replace: true })
          }
          return
        }
        // Já está numa tela de conta (rota ou janela sobre a página): só o aviso.
        if (!/^\/(login|cadastro)/.test(location.pathname) && !readAuthOverlay(location)) {
          // Página pública: login por cima dela. Privada (ex.: pagamento): rota /login; o rascunho do formulário fica salvo.
          void router.navigate(authNavigation(location, 'login', { redirect: location.href, reason: 'expired' }))
        }
      } else if (onPanel) {
        // Saiu (no painel, na loja ou em outra aba): o painel volta para a própria entrada.
        if (router.state.location.pathname !== '/admin/entrar') void router.navigate({ to: '/admin/entrar', search: { motivo: 'saiu' }, replace: true })
        else void router.invalidate()
      } else {
        void router.invalidate()
      }
    })
  }, [queryClient, router])

  return null
}
