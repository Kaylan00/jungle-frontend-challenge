import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import type { PasswordResetConfirmRequest, PasswordResetRequest } from '@/api/contracts'
import { api } from '@/api/endpoints'
import { ApiError } from '@/api/http'
import { sessionStore } from '@/api/session-store'

/** Erros que dizem "este link não serve mais" (400 inválido / 410 vencido, usado ou substituído). */
export function isResetLinkError(error: unknown): error is ApiError {
  return error instanceof ApiError && (error.code === 'RESET_TOKEN_INVALID' || error.code === 'RESET_TOKEN_EXPIRED')
}

/** Confere se o link do e-mail ainda vale antes de pedir a senha nova. */
export const passwordResetQuery = (token: string) =>
  queryOptions({
    queryKey: ['password-reset', token] as const,
    queryFn: ({ signal }) => api.getPasswordReset(token, { signal }),
    // O link só muda de estado por ação desta tela; conferir de novo ao voltar à aba não ajuda.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    gcTime: 0,
  })

export function useRequestPasswordReset() {
  return useMutation({ mutationFn: (input: PasswordResetRequest) => api.requestPasswordReset(input) })
}

export function useConfirmPasswordReset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: PasswordResetConfirmRequest) => api.confirmPasswordReset(input),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['password-reset'] })
      // A API encerra as sessões da conta ao trocar a senha; se este navegador tinha uma, ela acabou.
      if (sessionStore.getToken()) sessionStore.clear('logout')
    },
  })
}
