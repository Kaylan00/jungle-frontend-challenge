/**
 * Quem pode abrir o Kurio Admin. O papel NUNCA é decidido pelo navegador: a sessão é conferida pela API
 * (GET /auth/session) e o papel também (GET /admin/me, que responde 403 FORBIDDEN para conta comum).
 * Usado pelo guard da casca (/admin/*) e pela tela de entrada (/admin/entrar).
 */
import type { QueryClient } from '@tanstack/react-query'
import type { User } from '@/api/contracts'
import { ApiError } from '@/api/http'
import { adminMeQuery, sessionQuery } from '@/api/queries'

export type PanelAccess = { status: 'admin'; user: User } | { status: 'anonymous' } | { status: 'forbidden'; user: User; message: string }

export async function checkPanelAccess(queryClient: QueryClient): Promise<PanelAccess> {
  const session = await queryClient.ensureQueryData(sessionQuery)
  if (!session) return { status: 'anonymous' }
  try {
    const me = await queryClient.ensureQueryData(adminMeQuery(session.user.id))
    return { status: 'admin', user: me }
  } catch (error) {
    if (error instanceof ApiError && error.code === 'FORBIDDEN') return { status: 'forbidden', user: session.user, message: error.message }
    if (error instanceof ApiError && (error.code === 'UNAUTHENTICATED' || error.code === 'SESSION_EXPIRED')) return { status: 'anonymous' }
    throw error
  }
}
