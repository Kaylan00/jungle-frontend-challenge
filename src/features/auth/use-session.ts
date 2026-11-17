import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { LoginInput, Session, SignupRequest } from '@/api/contracts'
import { api } from '@/api/endpoints'
import { qk, sessionQuery } from '@/api/queries'
import { sessionStore } from '@/api/session-store'

export function useSession() {
  const q = useQuery(sessionQuery)
  const user = q.data?.user ?? null
  return {
    session: q.data ?? null,
    user,
    /** Dono dos dados privados no cache: id do usuário ou 'guest' */
    owner: user?.id ?? 'guest',
    isLoading: q.isPending,
  }
}

/**
 * Depois de autenticar:
 *  1. descarta o cache privado anterior (visitante ou outro usuário);
 *  2. grava o token (o socket reconecta com ele);
 *  3. junta o carrinho do visitante ao do usuário (itens preservados);
 *  4. publica a sessão no cache.
 */
async function afterAuth(queryClient: ReturnType<typeof useQueryClient>, session: Session) {
  const guestCartId = sessionStore.getGuestCartId()
  queryClient.removeQueries({ queryKey: qk.private })
  sessionStore.setToken(session.token)
  try {
    const cart = await api.mergeCart(guestCartId)
    queryClient.setQueryData(qk.cart(session.user.id), cart)
    sessionStore.setGuestCartId(null)
  } catch {
    // Falha ao juntar não bloqueia o login: o carrinho do visitante continua guardado e
    // a junção é tentada de novo no próximo login.
  }
  queryClient.setQueryData(qk.session, session)
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: LoginInput) => api.login(input),
    onSuccess: (session) => afterAuth(queryClient, session),
  })
}

export function useSignup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SignupRequest) => api.signup(input),
    onSuccess: (session) => afterAuth(queryClient, session),
  })
}

export function useLogout() {
  return useMutation({
    mutationFn: async () => {
      try {
        await api.logout()
      } finally {
        // Mesmo se a API falhar, o cliente encerra a sessão local (o token some daqui).
        sessionStore.clear('logout')
      }
    },
  })
}
