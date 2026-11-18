import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { UsersSection } from '@/features/admin/sections/users-section'

/** Usuários da loja, somente leitura (GET /admin/users, sem dados sensíveis). */
export const Route = createFileRoute('/admin/_painel/usuarios')({
  validateSearch: z.object({
    q: z.string().max(80).optional().catch(undefined),
    pagina: z.number().int().min(1).optional().catch(undefined),
  }),
  component: UsuariosRoute,
})

function UsuariosRoute() {
  return <UsersSection search={Route.useSearch()} />
}
