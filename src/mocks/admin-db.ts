/**
 * Leituras do painel (Kurio Admin) sobre o "banco" simulado: visão geral, pedidos de todos os usuários,
 * usuários sem dados sensíveis e o feed de atividade. Só leem o estado; quem grava (e registra a atividade)
 * continua sendo `db.ts`. As respostas seguem os contratos de `api/admin-contracts.ts`.
 */
import type {
  AdminActivity,
  AdminOrder,
  AdminOrderListParams,
  AdminOrderListResponse,
  AdminOverview,
  AdminUser,
  AdminUserListParams,
  AdminUserListResponse,
} from '@/api/admin-contracts'
import type { OrderStatus } from '@/api/contracts'
import { addEth } from '@/lib/eth'
import { getState, type StoredOrder, type StoredUser } from './db'

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

function paginate<T>(items: T[], page = 1, pageSize = 10) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const current = Math.min(Math.max(1, page), totalPages)
  return { items: items.slice((current - 1) * pageSize, current * pageSize), page: current, pageSize, total: items.length, totalPages }
}

export function adminOverview(): AdminOverview {
  const s = getState()
  let onSale = 0
  let soldOut = 0
  let unavailable = 0
  for (const n of s.nfts) {
    if (n.editions.some((e) => e.status === 'on_sale' && e.available > 0)) onSale += 1
    else if (n.editions.some((e) => e.status === 'sold_out')) soldOut += 1
    else unavailable += 1
  }
  const count = (status: OrderStatus) => s.orders.filter((o) => o.status === status).length
  const sum = (status: OrderStatus) => s.orders.filter((o) => o.status === status).reduce((t, o) => addEth(t, o.total), '0')
  return {
    nfts: { total: s.nfts.length, onSale, soldOut, unavailable, featured: s.nfts.filter((n) => n.featured).length },
    orders: { total: s.orders.length, pending: count('pending'), confirmed: count('confirmed'), rejected: count('rejected') },
    revenue: { confirmed: sum('confirmed'), pending: sum('pending') },
    users: { total: s.users.length, admins: s.users.filter((u) => u.role === 'admin').length },
    coupons: { active: (s.coupons ?? []).filter((c) => c.active && !(c.expiresAt && Date.parse(c.expiresAt) <= Date.now())).length },
    generatedAt: new Date().toISOString(),
  }
}

/** Mais recentes primeiro. */
export function listActivity(limit = 20): AdminActivity[] {
  return [...(getState().activity ?? [])].reverse().slice(0, limit)
}

function adminOrder(o: StoredOrder, users: Map<string, StoredUser>): AdminOrder {
  const u = users.get(o.userId)
  return {
    id: o.id,
    number: o.number,
    status: o.status,
    failureReason: o.failureReason,
    network: o.network,
    customer: { id: o.userId, name: u?.name ?? 'Conta removida', username: u?.username ?? '—' },
    lines: o.lines.map((l) => ({ nftId: l.nftId, name: l.name, editionName: l.editionName, quantity: l.quantity, lineTotal: l.lineTotal })),
    couponCode: o.coupon?.code ?? null,
    discount: o.discount,
    total: o.total,
    txHash: o.txHash,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    version: o.version,
  }
}

export function adminListOrders(p: AdminOrderListParams): AdminOrderListResponse {
  const s = getState()
  const users = new Map(s.users.map((u) => [u.id, u]))
  const q = p.q ? fold(p.q.trim()) : ''
  const matching = s.orders.filter((o) => {
    if (!q) return true
    const u = users.get(o.userId)
    return fold(`${o.number} ${u?.username ?? ''} ${u?.name ?? ''}`).includes(q)
  })
  const counts = {
    all: matching.length,
    pending: matching.filter((o) => o.status === 'pending').length,
    confirmed: matching.filter((o) => o.status === 'confirmed').length,
    rejected: matching.filter((o) => o.status === 'rejected').length,
  }
  const filtered = matching.filter((o) => !p.status || o.status === p.status).reverse()
  const page = paginate(filtered, p.page, p.pageSize ?? 10)
  return { ...page, items: page.items.map((o) => adminOrder(o, users)), counts }
}

/** a***@kurio.test: o bastante para reconhecer a conta, sem expor o endereço. */
export function maskEmail(email: string) {
  const [local, domain = ''] = email.split('@')
  return `${local.slice(0, 1)}***@${domain}`
}

export function adminListUsers(p: AdminUserListParams): AdminUserListResponse {
  const s = getState()
  const q = p.q ? fold(p.q.trim()) : ''
  const rows: AdminUser[] = s.users
    .filter((u) => !q || fold(`${u.name} ${u.username}`).includes(q))
    .sort((a, b) => (a.role === b.role ? a.createdAt.localeCompare(b.createdAt) || a.username.localeCompare(b.username) : a.role === 'admin' ? -1 : 1))
    .map((u) => ({
      id: u.id,
      name: u.name,
      username: u.username,
      emailMasked: maskEmail(u.email),
      role: u.role,
      createdAt: u.createdAt,
      orders: s.orders.filter((o) => o.userId === u.id).length,
      favorites: (s.favorites[u.id] ?? []).length,
    }))
  return paginate(rows, p.page, p.pageSize ?? 10)
}
