import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { checkPanelAccess } from '@/features/admin/access'
import { PanelLogin } from '@/features/admin/login/panel-login'
import { safePanelRedirect } from '@/features/admin/shell/sections'

/**
 * Entrada própria do Kurio Admin. Quem já está com sessão de admin vai direto para o painel; quem está com
 * sessão de conta comum vê o formulário com o aviso (e a mensagem do 403 da API).
 */
export const Route = createFileRoute('/admin/entrar')({
  validateSearch: z.object({
    redirect: z.string().max(2048).optional().catch(undefined),
    motivo: z.enum(['sem-permissao', 'expirada', 'saiu']).optional().catch(undefined),
  }),
  beforeLoad: async ({ context, search }) => {
    const access = await checkPanelAccess(context.queryClient)
    if (access.status === 'admin') throw redirect({ href: safePanelRedirect(search.redirect) ?? '/admin', replace: true })
    return { access }
  },
  component: EntrarRoute,
})

function EntrarRoute() {
  const search = Route.useSearch()
  const { access } = Route.useRouteContext()
  return <PanelLogin redirectTo={safePanelRedirect(search.redirect)} reason={search.motivo} access={access} />
}
