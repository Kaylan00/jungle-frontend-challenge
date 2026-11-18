/**
 * Contratos do painel administrativo (Kurio Admin) que não existiam na primeira versão do /admin:
 * identidade do painel, visão geral, pedidos de todos os usuários, usuários (sem dados sensíveis) e o feed
 * de atividade em tempo real. Ficam fora de `contracts.ts` (aquele arquivo é o contrato da loja); as regras
 * são as mesmas: o cliente valida o que chega da rede e os handlers MSW montam as respostas com estes tipos.
 *
 * Toda rota /admin/* exige sessão (401) e papel admin (403 FORBIDDEN), conferido pela API a cada chamada.
 */
import { z } from 'zod'
import { EthAmount, Network, OrderStatus, Paginated, UserRole } from './contracts'

// ---------- Visão geral ----------

/** GET /admin/overview: números do painel, calculados pelo servidor no momento da leitura. */
export const AdminOverview = z.object({
  nfts: z.object({
    total: z.number().int().nonnegative(),
    /** Com pelo menos uma edição à venda e estoque */
    onSale: z.number().int().nonnegative(),
    /** Sem nenhuma edição à venda porque o estoque acabou */
    soldOut: z.number().int().nonnegative(),
    /** Fora de venda por decisão do painel (todas as edições indisponíveis) */
    unavailable: z.number().int().nonnegative(),
    featured: z.number().int().nonnegative(),
  }),
  orders: z.object({
    total: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    confirmed: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
  }),
  revenue: z.object({
    /** Soma dos pedidos confirmados (simulada: nenhum valor real circula) */
    confirmed: EthAmount,
    /** Soma dos pedidos ainda em processamento */
    pending: EthAmount,
  }),
  users: z.object({ total: z.number().int().nonnegative(), admins: z.number().int().nonnegative() }),
  coupons: z.object({ active: z.number().int().nonnegative() }),
  generatedAt: z.string(),
})
export type AdminOverview = z.infer<typeof AdminOverview>

// ---------- Atividade (feed em tempo real) ----------

export const AdminActivityKind = z.enum([
  'order.created',
  'order.confirmed',
  'order.rejected',
  'nft.price',
  'nft.stock',
  'nft.status',
  'nft.featured',
  'coupon.created',
  'coupon.deactivated',
])
export type AdminActivityKind = z.infer<typeof AdminActivityKind>

/** Uma linha do feed. O texto vem pronto do servidor (como as mensagens de erro), sem dado sensível. */
export const AdminActivity = z.object({
  id: z.string(),
  occurredAt: z.string(),
  kind: AdminActivityKind,
  title: z.string(),
  detail: z.string(),
  resource: z.object({ type: z.enum(['order', 'nft', 'coupon']), id: z.string() }),
})
export type AdminActivity = z.infer<typeof AdminActivity>

/** GET /admin/activity: as mais recentes primeiro. */
export const AdminActivityList = z.object({ items: z.array(AdminActivity) })
export type AdminActivityList = z.infer<typeof AdminActivityList>

/**
 * Evento de Socket.IO `admin.activity`: só as conexões de contas admin recebem (o servidor confere o papel
 * da sessão ao conectar). Leva a mesma linha do feed; o cliente deduplica pelo `eventId`.
 */
export const AdminActivityEvent = z.object({
  type: z.literal('admin.activity'),
  eventId: z.string(),
  occurredAt: z.string(),
  version: z.number().int(),
  activity: AdminActivity,
})
export type AdminActivityEvent = z.infer<typeof AdminActivityEvent>

export const ADMIN_SOCKET_EVENTS = { activity: 'admin.activity' } as const

// ---------- Pedidos (todos os usuários) ----------

export const AdminOrderLine = z.object({
  nftId: z.string(),
  name: z.string(),
  editionName: z.string(),
  quantity: z.number().int().positive(),
  lineTotal: EthAmount,
})

/** Pedido visto pelo painel: sem os dados do perfil do colecionador (e-mail, ENS, observação). */
export const AdminOrder = z.object({
  id: z.string(),
  number: z.string(),
  status: OrderStatus,
  failureReason: z.string().nullable(),
  network: Network,
  customer: z.object({ id: z.string(), name: z.string(), username: z.string() }),
  lines: z.array(AdminOrderLine),
  couponCode: z.string().nullable(),
  discount: EthAmount,
  total: EthAmount,
  txHash: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int(),
})
export type AdminOrder = z.infer<typeof AdminOrder>

export const AdminOrderListParams = z.object({
  status: OrderStatus.optional(),
  /** Número do pedido (JG-00001) ou nome de usuário do cliente */
  q: z.string().trim().max(80).optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(50).optional(),
})
export type AdminOrderListParams = z.infer<typeof AdminOrderListParams>

/** GET /admin/orders: mais recentes primeiro, com a contagem por status (para as abas do filtro). */
export const AdminOrderListResponse = Paginated(AdminOrder).extend({
  counts: z.object({
    all: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    confirmed: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
  }),
})
export type AdminOrderListResponse = z.infer<typeof AdminOrderListResponse>

// ---------- Usuários (somente leitura) ----------

/** Conta vista pelo painel: sem senha, sessões, carteiras, avatar nem e-mail completo. */
export const AdminUser = z.object({
  id: z.string(),
  name: z.string(),
  username: z.string(),
  /** E-mail mascarado pelo servidor (a***@kurio.test): o painel identifica, não expõe. */
  emailMasked: z.string(),
  role: UserRole,
  createdAt: z.string(),
  orders: z.number().int().nonnegative(),
  favorites: z.number().int().nonnegative(),
})
export type AdminUser = z.infer<typeof AdminUser>

export const AdminUserListParams = z.object({
  q: z.string().trim().max(80).optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(50).optional(),
})
export type AdminUserListParams = z.infer<typeof AdminUserListParams>

export const AdminUserListResponse = Paginated(AdminUser)
export type AdminUserListResponse = z.infer<typeof AdminUserListResponse>
