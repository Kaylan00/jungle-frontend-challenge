/**
 * Consultas e mutations do painel (/admin). Tudo passa pela API (/admin/*), que confere o papel a cada chamada.
 *
 * - Lista de NFTs e cupons ficam sob ['private', <admin>, 'admin', ...]: somem no logout como o resto.
 * - Edição de edição: estado "Salvando…" no diálogo; a resposta (o NFT inteiro) entra no cache do painel e o
 *   resto do app (detalhe, cards, carrinhos) recebe a mudança pelo evento nft.updated, como qualquer cliente.
 * - Destaque: atualização otimista com rollback (o botão muda na hora; erro ou conflito desfaz e avisa).
 * - 409 de versão: o NFT atual (details.current) entra no cache, para a tela já mostrar o que está valendo.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { AdminOrderListParams, AdminUserListParams } from '@/api/admin-contracts'
import {
  AdminVersionConflict,
  type AdminCoupon,
  type AdminEditionPatch,
  type AdminNftListParams,
  type AdminNftListResponse,
  type CouponCreateInput,
  type LoginInput,
  type NftDetail,
} from '@/api/contracts'
import { api } from '@/api/endpoints'
import { ApiError } from '@/api/http'
import { adminActivityQuery, adminCouponsQuery, adminNftsQuery, adminOrdersQuery, adminOverviewQuery, adminUsersQuery, qk } from '@/api/queries'
import { sessionStore } from '@/api/session-store'
import { useSession } from '@/features/auth/use-session'
import { notifyError, notifySuccess } from '@/features/profile/hooks'

export function useAdminNfts(params: AdminNftListParams, enabled = true) {
  const { owner } = useSession()
  return useQuery({ ...adminNftsQuery(owner, params), enabled, placeholderData: keepPreviousData })
}

export function useAdminCoupons(enabled = true) {
  const { owner } = useSession()
  return useQuery({ ...adminCouponsQuery(owner), enabled })
}

export function useAdminOverview() {
  const { owner } = useSession()
  return useQuery(adminOverviewQuery(owner))
}

export function useAdminActivity() {
  const { owner } = useSession()
  return useQuery(adminActivityQuery(owner))
}

export function useAdminOrders(params: AdminOrderListParams) {
  const { owner } = useSession()
  return useQuery(adminOrdersQuery(owner, params))
}

export function useAdminUsers(params: AdminUserListParams) {
  const { owner } = useSession()
  return useQuery(adminUsersQuery(owner, params))
}

/**
 * Login do Kurio Admin: a mesma API de autenticação da loja, mas a sessão só é adotada nesta aba depois que
 * GET /admin/me (com o token recém-emitido) confirma o papel. Conta comum recebe o 403 da API: a sessão criada
 * é encerrada no servidor na hora e o erro (com a mensagem da API) volta para a tela.
 */
export function useAdminLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: LoginInput) => {
      const session = await api.login(input)
      try {
        const me = await api.adminMe({ token: session.token })
        return { session, me }
      } catch (error) {
        void api.logoutToken(session.token).catch(() => undefined)
        throw error
      }
    },
    onSuccess: ({ session, me }) => {
      queryClient.removeQueries({ queryKey: qk.private })
      sessionStore.setToken(session.token)
      queryClient.setQueryData(qk.session, session)
      queryClient.setQueryData(qk.adminMe(me.id), me)
    },
  })
}

/** Sair do painel encerra a sessão deste navegador (é a mesma da loja: mesmo origin, mesmo token). */
export function useAdminLogout() {
  return useMutation({
    mutationFn: async () => {
      try {
        await api.logout()
      } finally {
        sessionStore.clear('logout')
      }
    },
  })
}

/** O NFT atual do 409 de versão (ou null se o erro for outro). */
export function versionConflictOf(error: unknown): NftDetail | null {
  if (!(error instanceof ApiError) || error.code !== 'CONFLICT') return null
  const parsed = AdminVersionConflict.safeParse(error.details)
  return parsed.success ? parsed.data.current : null
}

/** Grava um NFT vindo da API em todas as páginas do painel (só se for mais novo que o que está lá). */
function putAdminNft(queryClient: QueryClient, owner: string, nft: NftDetail) {
  queryClient.setQueriesData<AdminNftListResponse>({ queryKey: qk.adminNftLists(owner) }, (old) =>
    old ? { ...old, items: old.items.map((n) => (n.id === nft.id && n.version <= nft.version ? nft : n)) } : old,
  )
}

export function useUpdateEdition() {
  const queryClient = useQueryClient()
  const { owner } = useSession()
  return useMutation({
    mutationFn: ({ nftId, editionId, patch }: { nftId: string; editionId: string; patch: AdminEditionPatch; label: string }) => api.adminUpdateEdition(nftId, editionId, patch),
    onSuccess: (nft, { label }) => {
      putAdminNft(queryClient, owner, nft)
      notifySuccess(`${label} salva. Quem está comprando já vê os valores novos.`)
    },
    onError: (error) => {
      const current = versionConflictOf(error)
      if (current) putAdminNft(queryClient, owner, current)
    },
  })
}

export function useToggleFeatured() {
  const queryClient = useQueryClient()
  const { owner } = useSession()
  const lists = qk.adminNftLists(owner)
  return useMutation({
    mutationFn: ({ nft, featured }: { nft: NftDetail; featured: boolean }) => api.adminUpdateNft(nft.id, { version: nft.version, featured }),
    onMutate: async ({ nft, featured }) => {
      await queryClient.cancelQueries({ queryKey: lists })
      const previous = queryClient.getQueriesData<AdminNftListResponse>({ queryKey: lists })
      queryClient.setQueriesData<AdminNftListResponse>({ queryKey: lists }, (old) =>
        old ? { ...old, items: old.items.map((n) => (n.id === nft.id ? { ...n, featured } : n)) } : old,
      )
      return { previous }
    },
    onError: (error, { nft, featured }, ctx) => {
      ctx?.previous.forEach(([key, data]) => queryClient.setQueryData(key, data))
      const current = versionConflictOf(error)
      if (current) {
        putAdminNft(queryClient, owner, current)
        notifyError(`${nft.name} mudou em outra aba ou por outra pessoa. A lista foi atualizada; confira e tente de novo.`)
      } else {
        notifyError(`Não foi possível ${featured ? 'destacar' : 'tirar dos destaques'} ${nft.name}. ${error instanceof ApiError ? error.message : ''}`.trim())
      }
    },
    onSuccess: (saved) => {
      putAdminNft(queryClient, owner, saved)
      notifySuccess(saved.featured ? `${saved.name} agora aparece nos destaques.` : `${saved.name} saiu dos destaques.`)
    },
  })
}

export function useCreateCoupon() {
  const queryClient = useQueryClient()
  const { owner } = useSession()
  return useMutation({
    mutationFn: (input: CouponCreateInput) => api.adminCreateCoupon(input),
    onSuccess: (coupon) => {
      queryClient.setQueryData<{ items: AdminCoupon[] }>(qk.adminCoupons(owner), (old) => (old ? { items: [coupon, ...old.items.filter((c) => c.code !== coupon.code)] } : old))
      void queryClient.invalidateQueries({ queryKey: qk.adminCoupons(owner) })
      notifySuccess(`Cupom ${coupon.code} criado. Já vale no carrinho e no pagamento.`)
    },
  })
}

export function useDeactivateCoupon() {
  const queryClient = useQueryClient()
  const { owner } = useSession()
  return useMutation({
    mutationFn: (code: string) => api.adminDeactivateCoupon(code),
    onSuccess: (coupon) => {
      queryClient.setQueryData<{ items: AdminCoupon[] }>(qk.adminCoupons(owner), (old) => (old ? { items: old.items.map((c) => (c.code === coupon.code ? coupon : c)) } : old))
      // O carrinho de quem tinha o cupom é recalculado no servidor; o desta aba é conferido de novo.
      void queryClient.invalidateQueries({ queryKey: qk.cart(owner) })
      notifySuccess(`Cupom ${coupon.code} desativado. Carrinhos com ele perderam o desconto.`)
    },
    onError: (error) => notifyError(`Não foi possível desativar o cupom. ${error instanceof ApiError ? error.message : ''}`.trim()),
  })
}
