/**
 * Chaves e opções de consulta do TanStack Query.
 *
 * Regra de isolamento: tudo que é privado fica sob ['private', <dono>, ...].
 *  - <dono> = id do usuário logado, ou 'guest' para o carrinho de visitante.
 *  - Logout/troca de usuário remove ['private'] inteiro: nada da sessão anterior sobra no cache.
 * Dados públicos (catálogo) ficam em ['nfts', ...] e a chave inclui todos os parâmetros da busca,
 * então uma resposta atrasada de outra busca nunca aparece na tela atual.
 */
import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import type { AdminOrderListParams, AdminUserListParams } from './admin-contracts'
import type { AdminNftListParams, Network, NftListParams, Session } from './contracts'
import { api } from './endpoints'
import { ApiError } from './http'
import { sessionStore } from './session-store'

export type Owner = string // userId ou 'guest'

export const qk = {
  session: ['session'] as const,
  nfts: ['nfts'] as const,
  nftList: (p: NftListParams) => ['nfts', 'list', p] as const,
  nftDetail: (id: string) => ['nfts', 'detail', id] as const,
  featured: ['nfts', 'featured'] as const,
  private: ['private'] as const,
  favorites: (owner: Owner) => ['private', owner, 'favorites'] as const,
  cart: (owner: Owner) => ['private', owner, 'cart'] as const,
  order: (owner: Owner, id: string) => ['private', owner, 'orders', id] as const,
  orders: (owner: Owner) => ['private', owner, 'orders'] as const,
  profile: (owner: Owner) => ['private', owner, 'profile'] as const,
  wallets: (owner: Owner) => ['private', owner, 'wallets'] as const,
  /** Sugestões da busca (5 primeiros resultados); a chave inclui o termo. */
  nftSuggest: (q: string) => ['nfts', 'suggest', q] as const,
  /** Painel: privado (some no logout) e por usuário, como o resto. */
  admin: (owner: Owner) => ['private', owner, 'admin'] as const,
  adminNftLists: (owner: Owner) => ['private', owner, 'admin', 'nfts'] as const,
  adminNfts: (owner: Owner, p: AdminNftListParams) => ['private', owner, 'admin', 'nfts', p] as const,
  adminCoupons: (owner: Owner) => ['private', owner, 'admin', 'coupons'] as const,
  /** Kurio Admin: identidade (papel conferido pela API), números, feed, pedidos e usuários. */
  adminMe: (owner: Owner) => ['private', owner, 'admin', 'me'] as const,
  adminOverview: (owner: Owner) => ['private', owner, 'admin', 'overview'] as const,
  adminActivity: (owner: Owner) => ['private', owner, 'admin', 'activity'] as const,
  adminOrderLists: (owner: Owner) => ['private', owner, 'admin', 'orders'] as const,
  adminOrders: (owner: Owner, p: AdminOrderListParams) => ['private', owner, 'admin', 'orders', p] as const,
  adminUsers: (owner: Owner, p: AdminUserListParams) => ['private', owner, 'admin', 'users', p] as const,
  /** Busca global do painel: NFTs pelo nome (poucos resultados, chave inclui o termo). */
  adminSearchNfts: (owner: Owner, q: string) => ['private', owner, 'admin', 'search', q] as const,
}

export const ADMIN_ACTIVITY_LIMIT = 20

export const adminMeQuery = (owner: Owner) =>
  queryOptions({
    queryKey: qk.adminMe(owner),
    queryFn: ({ signal }) => api.adminMe({ signal }),
    staleTime: 60_000,
    // 403 é resposta, não falha passageira: não repete.
    retry: (count, error) => !(error instanceof ApiError && !error.isTransient) && count < 2,
  })

export const adminOverviewQuery = (owner: Owner) =>
  queryOptions({
    queryKey: qk.adminOverview(owner),
    queryFn: ({ signal }) => api.adminOverview({ signal }),
    // O socket invalida a cada atividade; a consulta periódica cobre o pagamento que vence sem evento visto.
    refetchInterval: 15_000,
  })

export const adminActivityQuery = (owner: Owner) =>
  queryOptions({
    queryKey: qk.adminActivity(owner),
    queryFn: ({ signal }) => api.adminActivity(ADMIN_ACTIVITY_LIMIT, { signal }),
  })

export const adminOrdersQuery = (owner: Owner, p: AdminOrderListParams) =>
  queryOptions({
    queryKey: qk.adminOrders(owner, p),
    queryFn: ({ signal }) => api.adminListOrders(p, { signal }),
    placeholderData: keepPreviousData,
    // Rede de segurança do "ao vivo": com pedido pendente na tela, confere a cada 5 s mesmo sem socket.
    refetchInterval: (q) => (q.state.data?.items.some((o) => o.status === 'pending') ? 5_000 : false),
  })

export const adminUsersQuery = (owner: Owner, p: AdminUserListParams) =>
  queryOptions({
    queryKey: qk.adminUsers(owner, p),
    queryFn: ({ signal }) => api.adminListUsers(p, { signal }),
    placeholderData: keepPreviousData,
  })

export const adminSearchNftsQuery = (owner: Owner, q: string) =>
  queryOptions({
    queryKey: qk.adminSearchNfts(owner, q),
    queryFn: ({ signal }) => api.adminListNfts({ q, pageSize: 6 }, { signal }),
    staleTime: 15_000,
  })

export const ADMIN_PAGE_SIZE = 8

export const adminNftsQuery = (owner: Owner, p: AdminNftListParams) =>
  queryOptions({
    queryKey: qk.adminNfts(owner, p),
    queryFn: ({ signal }) => api.adminListNfts(p, { signal }),
    placeholderData: keepPreviousData,
  })

export const adminCouponsQuery = (owner: Owner) =>
  queryOptions({
    queryKey: qk.adminCoupons(owner),
    queryFn: ({ signal }) => api.adminListCoupons({ signal }),
  })

/** Sugestões: o `signal` cancela a busca quando o termo muda (a consulta antiga fica sem observador). */
export const nftSuggestQuery = (q: string) =>
  queryOptions({
    queryKey: qk.nftSuggest(q),
    queryFn: ({ signal }) => api.listNfts({ q, pageSize: 5 }, { signal }),
    staleTime: 30_000,
  })

export const sessionQuery = queryOptions({
  queryKey: qk.session,
  // Sem `signal` de propósito: a sessão é compartilhada pelo guard das rotas (ensureQueryData).
  // Se ela fosse cancelável, desmontar um componente no meio da busca rejeitaria o guard.
  queryFn: async (): Promise<Session | null> => {
    if (!sessionStore.getToken()) return null
    try {
      return await api.getSession()
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'UNAUTHENTICATED' || e.code === 'SESSION_EXPIRED')) {
        sessionStore.clear(e.code === 'SESSION_EXPIRED' ? 'expired' : 'logout')
        return null
      }
      throw e
    }
  },
  staleTime: 60_000,
})

export const nftListQuery = (p: NftListParams) =>
  queryOptions({
    queryKey: qk.nftList(p),
    queryFn: ({ signal }) => api.listNfts(p, { signal }),
    // Mantém a página anterior visível (esmaecida) enquanto a nova carrega: sem pulo de layout.
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })

export const featuredQuery = queryOptions({
  queryKey: qk.featured,
  queryFn: ({ signal }) => api.featuredNfts({ signal }),
  staleTime: 60_000,
})

export const nftDetailQuery = (id: string) =>
  queryOptions({
    queryKey: qk.nftDetail(id),
    queryFn: ({ signal }) => api.getNft(id, { signal }),
    staleTime: 30_000,
  })

export const favoritesQuery = (owner: Owner) =>
  queryOptions({
    queryKey: qk.favorites(owner),
    queryFn: ({ signal }) => api.getFavorites({ signal }),
    staleTime: 5 * 60_000,
  })

export const cartQuery = (owner: Owner) =>
  queryOptions({
    queryKey: qk.cart(owner),
    queryFn: ({ signal }) => api.getCart({ signal }),
    staleTime: 0,
  })

/** Histórico de compras (Atividade). Sempre confere ao abrir: um pedido novo ou que mudou de status aparece na hora. */
export const ordersQuery = (owner: Owner) =>
  queryOptions({
    queryKey: qk.orders(owner),
    queryFn: ({ signal }) => api.listOrders(undefined, { signal }),
    staleTime: 0,
    // Com pedido pendente, confere a cada 5 s mesmo sem socket (a mesma rede de segurança do recibo).
    refetchInterval: (q) => (q.state.data?.items.some((o) => o.status === 'pending') ? 5_000 : false),
  })

/**
 * Totais do carrinho para a rede escolhida no pagamento. Fica sob a chave do carrinho: toda invalidação do carrinho
 * (cupom, quantidade, evento de preço) atualiza também estes totais.
 */
export const cartSummaryQuery = (owner: Owner, network: Network) =>
  queryOptions({
    queryKey: [...qk.cart(owner), 'summary', network] as const,
    queryFn: ({ signal }) => api.getCartSummary(network, { signal }),
    placeholderData: keepPreviousData,
  })

export const orderQuery = (owner: Owner, id: string) =>
  queryOptions({
    queryKey: qk.order(owner, id),
    queryFn: ({ signal }) => api.getOrder(id, { signal }),
    // Enquanto pendente, confere a cada 5 s mesmo sem socket (rede de segurança); terminal = para.
    refetchInterval: (q) => (q.state.data?.status === 'pending' ? 5_000 : false),
  })

export const profileQuery = (owner: Owner) =>
  queryOptions({
    queryKey: qk.profile(owner),
    queryFn: ({ signal }) => api.getProfile({ signal }),
  })

export const walletsQuery = (owner: Owner) =>
  queryOptions({
    queryKey: qk.wallets(owner),
    queryFn: ({ signal }) => api.getWallets({ signal }),
  })
