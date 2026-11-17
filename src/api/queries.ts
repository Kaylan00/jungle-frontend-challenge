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
import type { NftListParams, Session } from './contracts'
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
}

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
