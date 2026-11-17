/**
 * Consultas e mutations do perfil e das carteiras.
 *
 * O usuário aparece em dois lugares do cache: no perfil (['private', id, 'profile']) e na sessão
 * (['session'], usada pelo cabeçalho). Toda mutation que devolve o usuário atualiza os dois, então
 * nome e avatar novos aparecem no cabeçalho na hora, sem nova requisição.
 * Mensagens de sucesso/erro ficam nas páginas: cada formulário decide como mostrar o erro (no campo ou geral).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { PasswordChangeInput, ProfileInput, Session, User, Wallet, WalletInput } from '@/api/contracts'
import { api } from '@/api/endpoints'
import { ApiError } from '@/api/http'
import { profileQuery, qk, walletsQuery } from '@/api/queries'
import { useSession } from '@/features/auth/use-session'
import { announce } from '@/lib/announcer'

/** Feedback visual (toast) e para leitor de tela (aria-live) ao mesmo tempo. */
export function notifySuccess(message: string) {
  toast.success(message)
  announce(message)
}

export function notifyError(message: string) {
  toast.error(message)
  announce(message, 'assertive')
}

export function useProfile() {
  const { owner, user } = useSession()
  return useQuery({ ...profileQuery(owner), enabled: Boolean(user) })
}

function useSyncUser() {
  const queryClient = useQueryClient()
  const { owner } = useSession()
  return (user: User) => {
    queryClient.setQueryData(qk.profile(owner), user)
    queryClient.setQueryData<Session | null>(qk.session, (session) => (session ? { ...session, user } : session))
  }
}

export function useUpdateProfile() {
  const sync = useSyncUser()
  return useMutation({ mutationFn: (input: ProfileInput) => api.updateProfile(input), onSuccess: sync })
}

export function useUpdateAvatar() {
  const sync = useSyncUser()
  return useMutation({ mutationFn: (dataUrl: string) => api.updateAvatar(dataUrl), onSuccess: sync })
}

export function useRemoveAvatar() {
  const sync = useSyncUser()
  return useMutation({ mutationFn: () => api.removeAvatar(), onSuccess: sync })
}

export function useChangePassword() {
  return useMutation({ mutationFn: (input: PasswordChangeInput) => api.changePassword(input) })
}

export function useWallets() {
  const { owner, user } = useSession()
  return useQuery({ ...walletsQuery(owner), enabled: Boolean(user) })
}

/** Cria (sem id) ou atualiza (com id) uma carteira. */
export function useSaveWallet() {
  const queryClient = useQueryClient()
  const { owner } = useSession()
  const key = qk.wallets(owner)
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: WalletInput }) => (id ? api.updateWallet(id, input) : api.createWallet(input)),
    onSuccess: (saved) => {
      // Mostra a carteira salva na hora e depois confere com a API (o servidor pode trocar os papéis).
      queryClient.setQueryData<{ items: Wallet[] }>(key, (old) => {
        const items = (old?.items ?? []).filter((w) => w.id !== saved.id)
        return { items: [...items, saved] }
      })
      void queryClient.invalidateQueries({ queryKey: key })
    },
    onError: (error) => {
      // Conflito (ex.: a carteira já foi criada em outra aba): busca a lista atual.
      if (error instanceof ApiError && error.code === 'CONFLICT') void queryClient.invalidateQueries({ queryKey: key })
    },
  })
}
