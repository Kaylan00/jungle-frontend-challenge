/**
 * Funções de acesso à API REST. Uma por operação do contrato, sempre tipadas e validadas.
 * O `signal` do TanStack Query é repassado ao Axios: consultas obsoletas são canceladas.
 */
import { z } from 'zod'
import {
  AdminCoupon,
  AdminCouponList,
  AdminNftListResponse,
  Cart,
  FavoritesResponse,
  FeaturedResponse,
  NftDetail,
  NftListResponse,
  Order,
  PasswordResetAccepted,
  PasswordResetDone,
  PasswordResetTokenInfo,
  Quote,
  Session,
  User,
  Wallet,
  WalletConnection,
  type AddToCartInput,
  type AdminEditionPatch,
  type AdminNftListParams,
  type AdminNftPatch,
  type CouponCreateInput,
  type CreateOrderInput,
  type LoginInput,
  type Network,
  type NftListParams,
  type PasswordChangeInput,
  type PasswordResetConfirmRequest,
  type PasswordResetRequest,
  type ProfileInput,
  type QuoteInput,
  type SignupRequest,
  type WalletInput,
} from './contracts'
import { request } from './http'

type Opts = { signal?: AbortSignal }

/** Serializa os filtros como a API espera (listas separadas por vírgula, sem vazios). */
export function nftListQueryString(p: NftListParams) {
  const params: Record<string, string> = {}
  if (p.q) params.q = p.q
  if (p.category?.length) params.category = p.category.join(',')
  if (p.network?.length) params.network = p.network.join(',')
  if (p.minPrice) params.minPrice = p.minPrice
  if (p.maxPrice) params.maxPrice = p.maxPrice
  if (p.onlyAvailable) params.onlyAvailable = 'true'
  if (p.sort) params.sort = p.sort
  if (p.page) params.page = String(p.page)
  if (p.pageSize) params.pageSize = String(p.pageSize)
  return params
}

export const api = {
  // Sessão
  signup: (body: SignupRequest) => request(Session, { method: 'POST', url: '/auth/signup', data: body }),
  login: (body: LoginInput) => request(Session, { method: 'POST', url: '/auth/login', data: body }),
  getSession: ({ signal }: Opts = {}) => request(Session, { url: '/auth/session', signal }),
  logout: () => request(z.any(), { method: 'POST', url: '/auth/logout' }),

  // Recuperação de senha
  requestPasswordReset: (body: PasswordResetRequest) => request(PasswordResetAccepted, { method: 'POST', url: '/auth/password-reset', data: body }),
  getPasswordReset: (token: string, { signal }: Opts = {}) =>
    request(PasswordResetTokenInfo, { url: `/auth/password-reset/${encodeURIComponent(token)}`, signal }),
  confirmPasswordReset: (body: PasswordResetConfirmRequest) =>
    request(PasswordResetDone, { method: 'POST', url: '/auth/password-reset/confirm', data: body }),

  // Catálogo
  listNfts: (p: NftListParams, { signal }: Opts = {}) => request(NftListResponse, { url: '/nfts', params: nftListQueryString(p), signal }),
  featuredNfts: ({ signal }: Opts = {}) => request(FeaturedResponse, { url: '/nfts/featured', signal }),
  getNft: (id: string, { signal }: Opts = {}) => request(NftDetail, { url: `/nfts/${encodeURIComponent(id)}`, signal }),

  // Favoritos
  getFavorites: ({ signal }: Opts = {}) => request(FavoritesResponse, { url: '/favorites', signal }),
  addFavorite: (nftId: string) => request(FavoritesResponse, { method: 'PUT', url: `/favorites/${nftId}` }),
  removeFavorite: (nftId: string) => request(FavoritesResponse, { method: 'DELETE', url: `/favorites/${nftId}` }),

  // Carrinho
  getCart: ({ signal }: Opts = {}) => request(Cart, { url: '/cart', signal }),
  addToCart: (body: AddToCartInput) => request(Cart, { method: 'POST', url: '/cart/items', data: body }),
  updateCartItem: (itemId: string, quantity: number) => request(Cart, { method: 'PATCH', url: `/cart/items/${itemId}`, data: { quantity } }),
  removeCartItem: (itemId: string) => request(Cart, { method: 'DELETE', url: `/cart/items/${itemId}` }),
  applyCoupon: (code: string) => request(Cart, { method: 'POST', url: '/cart/coupon', data: { code } }),
  removeCoupon: () => request(Cart, { method: 'DELETE', url: '/cart/coupon' }),
  acknowledgePrices: () => request(Cart, { method: 'POST', url: '/cart/acknowledge-prices' }),
  mergeCart: (guestCartId: string | null) => request(Cart, { method: 'POST', url: '/cart/merge', data: { guestCartId } }),

  // Cotação e pedidos
  createQuote: (body: QuoteInput) => request(Quote, { method: 'POST', url: '/quotes', data: body }),
  createOrder: (body: CreateOrderInput, idempotencyKey: string) =>
    request(Order, { method: 'POST', url: '/orders', data: body, headers: { 'Idempotency-Key': idempotencyKey }, timeout: 8_000 }),
  getOrder: (id: string, { signal }: Opts = {}) => request(Order, { url: `/orders/${encodeURIComponent(id)}`, signal }),
  listOrders: (status?: Order['status'], { signal }: Opts = {}) =>
    request(z.object({ items: z.array(Order) }), { url: '/orders', params: status ? { status } : {}, signal }),

  // Perfil
  getProfile: ({ signal }: Opts = {}) => request(User, { url: '/profile', signal }),
  updateProfile: (body: ProfileInput) => request(User, { method: 'PATCH', url: '/profile', data: body }),
  updateAvatar: (dataUrl: string) => request(User, { method: 'PUT', url: '/profile/avatar', data: { dataUrl } }),
  removeAvatar: () => request(User, { method: 'DELETE', url: '/profile/avatar' }),
  changePassword: (body: PasswordChangeInput) => request(z.any(), { method: 'POST', url: '/profile/password', data: body }),

  // Carteiras
  getWallets: ({ signal }: Opts = {}) => request(z.object({ items: z.array(Wallet) }), { url: '/wallets', signal }),
  createWallet: (body: WalletInput) => request(Wallet, { method: 'POST', url: '/wallets', data: body }),
  updateWallet: (id: string, body: WalletInput) => request(Wallet, { method: 'PUT', url: `/wallets/${id}`, data: body }),
  connectWallet: (id: string, network: Network) => request(WalletConnection, { method: 'POST', url: `/wallets/${id}/connect`, data: { network } }),
  disconnectWallet: (id: string) => request(z.any(), { method: 'DELETE', url: `/wallets/${id}/connect` }),

  // Painel administrativo (403 FORBIDDEN para conta comum)
  adminListNfts: (p: AdminNftListParams, { signal }: Opts = {}) =>
    request(AdminNftListResponse, {
      url: '/admin/nfts',
      params: { ...(p.q ? { q: p.q } : {}), ...(p.page ? { page: String(p.page) } : {}), ...(p.pageSize ? { pageSize: String(p.pageSize) } : {}) },
      signal,
    }),
  adminUpdateNft: (id: string, body: AdminNftPatch) => request(NftDetail, { method: 'PATCH', url: `/admin/nfts/${encodeURIComponent(id)}`, data: body }),
  adminUpdateEdition: (id: string, editionId: string, body: AdminEditionPatch) =>
    request(NftDetail, { method: 'PATCH', url: `/admin/nfts/${encodeURIComponent(id)}/editions/${encodeURIComponent(editionId)}`, data: body }),
  adminListCoupons: ({ signal }: Opts = {}) => request(AdminCouponList, { url: '/admin/coupons', signal }),
  adminCreateCoupon: (body: CouponCreateInput) => request(AdminCoupon, { method: 'POST', url: '/admin/coupons', data: body }),
  adminDeactivateCoupon: (code: string) => request(AdminCoupon, { method: 'POST', url: `/admin/coupons/${encodeURIComponent(code)}/deactivate` }),
}
