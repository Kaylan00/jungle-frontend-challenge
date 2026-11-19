/**
 * "Banco de dados" do servidor simulado.
 *
 * Um único estado consistente entre catálogo, favoritos, carrinho, perfil, carteiras e pedidos.
 * Toda mudança que interessa ao tempo real (preço, estoque, status de pedido) gera um evento
 * que o servidor Socket.IO simulado (mocks/realtime.ts) envia aos clientes conectados.
 *
 * Persistência: localStorage, para sobreviver ao refresh. `resetDb()` restaura a seed.
 * Senhas: PBKDF2-HMAC-SHA-256 (600 mil iterações) com salt aleatório por usuário; nunca em claro (ver `hashPassword`).
 *
 * Várias abas, um "servidor" (ver "Transações e propagação entre abas" abaixo): cada aba roda o seu MSW e o
 * seu servidor Socket.IO, mas todas leem e gravam o mesmo estado. Cada escrita acontece numa transação
 * (`withDb`) com trava entre abas (Web Locks), relê o estado salvo antes de mexer nele, grava com uma revisão
 * nova (`rev`) e avisa as outras abas por BroadcastChannel, levando os eventos gerados. Quem recebe recarrega
 * o estado e entrega os MESMOS eventos (mesmo eventId e versão) aos sockets da própria aba, sem reenviar.
 */
import type {
  AdminCoupon,
  AdminEditionPatch,
  Cart,
  CartItem,
  Coupon,
  CouponCreateInput,
  CouponKind,
  Network,
  NftDetail,
  NftSummary,
  NftUpdatedEvent,
  Order,
  OrderUpdatedEvent,
  Quote,
  QuoteLine,
  User,
  Wallet,
} from '@/api/contracts'
import { NftDetail as NftDetailSchema } from '@/api/contracts'
import type { AdminActivity, AdminActivityEvent, AdminActivityKind } from '@/api/admin-contracts'
import { addEth, compareEth, mulEth, percentOf, subEth, toEthString } from '@/lib/eth'
import { explorerUrl } from '@/lib/explorer'
import { buildNftFixtures } from './fixtures/nfts'
import { COUPONS, NETWORK_FEES, SEED_DATE, SEED_USERS } from './fixtures/users'

// ---------- Tipos internos (o que o "servidor" guarda) ----------

export interface StoredUser extends User {
  passwordHash: string
  salt: string
}

interface StoredSession {
  token: string
  userId: string
  expiresAt: number
}

interface StoredCartItem {
  id: string
  nftId: string
  editionId: string
  quantity: number
  priceWhenAdded: string
}

interface StoredCart {
  id: string
  userId: string | null
  items: StoredCartItem[]
  couponCode: string | null
  version: number
  updatedAt: string
}

interface StoredQuote extends Quote {
  userId: string
  cartId: string
}

export interface StoredOrder extends Order {
  /** Resultado decidido na criação a partir do cenário; aplicado quando settleAt passa */
  outcome: 'approve' | 'reject'
  settleAt: number
}

interface IdempotencyRecord {
  userId: string
  key: string
  requestHash: string
  orderId: string
}

/** Pedido de redefinição de senha. Só o hash do token fica guardado (como num backend real). */
interface StoredPasswordReset {
  id: string
  userId: string
  tokenHash: string
  createdAt: number
  expiresAt: number
  /** Quando foi usado para trocar a senha */
  usedAt: number | null
  /** Quando um pedido mais novo o substituiu */
  supersededAt: number | null
}

/** E-mail que o servidor "enviaria". Não há servidor de e-mail: ele fica nesta caixa de saída. */
export interface SimulatedEmail {
  id: string
  to: string
  subject: string
  text: string
  /** Link de ação do e-mail (absoluto) e o mesmo caminho relativo ao app */
  link: string
  path: string
  sentAt: string
}

/** Cupom guardado no servidor (seed ou criado no painel). */
export interface StoredCoupon {
  code: string
  description: string
  kind: CouponKind
  /** Percentual ("10") ou valor em ETH ("0.05") */
  value: string
  expiresAt: string | null
  active: boolean
  createdAt: string
}

export interface DbState {
  schema: 1
  users: StoredUser[]
  sessions: StoredSession[]
  /** Opcionais: estados salvos antes da recuperação de senha não têm esses campos. */
  passwordResets?: StoredPasswordReset[]
  outbox?: SimulatedEmail[]
  /** Opcional: estados salvos antes do painel admin recebem os cupons da seed na carga (migrate). */
  coupons?: StoredCoupon[]
  /** Opcional: feed de atividade do painel (mais recentes no fim, no máximo ACTIVITY_MAX). */
  activity?: AdminActivity[]
  nfts: NftDetail[]
  favorites: Record<string, string[]>
  carts: Record<string, StoredCart>
  wallets: Record<string, Wallet[]>
  quotes: Record<string, StoredQuote>
  orders: StoredOrder[]
  idempotency: IdempotencyRecord[]
  seq: number
  eventSeq: number
  /** Revisão do estado salvo: cresce a cada gravação; as abas comparam para saber se o que têm ficou velho. */
  rev?: number
}

const STORAGE_KEY = 'jungle.mock.db.v1'
/** Só a revisão, para conferir barato (sem ler o JSON inteiro) se outra aba gravou algo. */
const REV_KEY = 'jungle.mock.db.rev'
const LOCK_NAME = 'jungle.mock.db'
const CHANNEL_NAME = 'jungle.mock.db'

let state: DbState
let ready: Promise<void> | null = null

// ---------- Utilidades ----------

const now = () => Date.now()
const iso = (t = now()) => new Date(t).toISOString()

function nextId(prefix: string) {
  state.seq += 1
  return `${prefix}-${state.seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

function randomHex(bytes: number) {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('')
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Hash de senha: PBKDF2-HMAC-SHA-256, a função de derivação de chave para senhas que o navegador tem nativa
 * (Web Crypto). 600 mil iterações é a recomendação atual da OWASP para PBKDF2-SHA256; medido em ~80 ms num
 * notebook comum, e só roda em cadastro, login e troca de senha (a seed já vem com o hash pronto). Com backend
 * real, o hash ficaria no servidor, com Argon2id ou bcrypt.
 *
 * Formato guardado, autodescritivo: `pbkdf2-sha256$<iterações>$<hash hex>`. As iterações vão junto para um hash
 * antigo continuar conferindo se a constante mudar (e ser refeito no próximo login).
 */
export const PASSWORD_ITERATIONS = 600_000
const PASSWORD_SCHEME = 'pbkdf2-sha256'

export async function hashPassword(password: string, salt: string, iterations = PASSWORD_ITERATIONS) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations }, key, 256)
  return `${PASSWORD_SCHEME}$${iterations}$${toHex(bits)}`
}

/** Formato das versões anteriores (SHA-256 de `salt:senha`): só para conferir uma última vez e migrar. */
async function legacySha256Hash(password: string, salt: string) {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${password}`)))
}

/** Compara sem sair no primeiro caractere diferente (o tempo não revela quanto do hash bateu). */
function constantTimeEqual(a: string, b: string) {
  let diff = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  return diff === 0
}

export async function stableHash(value: unknown) {
  const data = new TextEncoder().encode(JSON.stringify(value))
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest).slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('')
}

// ---------- Transações e propagação entre abas ----------
//
// - `withDb(fn)`: trava entre abas (navigator.locks; sem ele, só uma fila nesta aba), relê o estado salvo se
//   outra aba gravou depois (rev maior), roda `fn` e, se algo mudou, grava UMA vez com rev + 1 e avisa as abas.
// - Fora de transação (testes unitários chamando o db direto), cada `persist()` grava na hora, como antes.
// - Mensagem entre abas: { from, rev, events, reset }. Quem recebe recarrega (se a rev for maior) e entrega os
//   eventos aos ouvintes locais (o servidor Socket.IO da aba) SEM reenviar: não há eco nem laço. O próprio
//   BroadcastChannel não entrega a mensagem a quem enviou; `from` é uma segunda garantia.

export type DbEvent = NftUpdatedEvent | OrderUpdatedEvent | AdminActivityEvent

export interface SyncMessage {
  from: string
  rev: number
  events: DbEvent[]
  reset?: boolean
}

/** Identidade desta aba (desta instância do servidor simulado). */
export const TAB_ID = `tab-${Math.random().toString(36).slice(2, 10)}`

let inTx = false
let dirty = false
let pendingEvents: DbEvent[] = []
let pendingReset = false
let channel: BroadcastChannel | null = null
let localQueue: Promise<unknown> = Promise.resolve()

function readStoredRev() {
  try {
    const raw = localStorage.getItem(REV_KEY)
    return raw === null ? -1 : Number(raw) || 0
  } catch {
    return -1
  }
}

function post(message: Omit<SyncMessage, 'from'>) {
  try {
    channel?.postMessage({ ...message, from: TAB_ID } satisfies SyncMessage)
  } catch {
    /* canal fechado: as outras abas reconciliam ao reconectar ou no foco */
  }
}

/** Grava o estado com uma revisão nova e avisa as outras abas (com os eventos desta transação). */
function commit() {
  dirty = false
  state.rev = Math.max(state.rev ?? 0, readStoredRev()) + 1
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    localStorage.setItem(REV_KEY, String(state.rev))
  } catch {
    /* storage cheio ou indisponível: segue só em memória */
  }
  const events = pendingEvents
  const reset = pendingReset
  pendingEvents = []
  pendingReset = false
  post({ rev: state.rev, events, reset: reset || undefined })
}

function persist() {
  if (inTx) {
    dirty = true
    return
  }
  commit()
}

/**
 * Recarrega o estado salvo se outra aba gravou uma revisão mais nova. Barato quando nada mudou (lê só a rev).
 * Nunca roda no meio de uma transação desta aba: lá o estado já foi relido ao pegar a trava.
 */
export function refreshFromStorage() {
  if (inTx || !state) return false
  const stored = readStoredRev()
  if (stored <= (state.rev ?? 0)) return false
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as DbState) : null
    if (!isUsableState(parsed)) return false
    state = parsed
    state.rev = Math.max(state.rev ?? 0, stored)
    return true
  } catch {
    return false
  }
}

/** Maior revisão anunciada por outra aba (pode chegar antes de o storage desta aba refletir a gravação). */
let knownRev = 0

/**
 * Entre processos do navegador o localStorage pode refletir a gravação de outra aba um pouco depois do aviso
 * pelo BroadcastChannel. Relê por até ~1 s até alcançar a revisão anunciada.
 */
async function catchUp(target: number) {
  for (let i = 0; i < 50 && (state.rev ?? 0) < target; i++) {
    await new Promise((r) => setTimeout(r, 20))
    refreshFromStorage()
  }
  // Não chegou (ex.: a outra aba ficou sem espaço no storage): segue com o que há, sem esperar de novo.
  if ((state.rev ?? 0) < knownRev) knownRev = state.rev ?? 0
}

type LockRequest = <T>(name: string, callback: () => Promise<T>) => Promise<T>

function crossTabLock(): LockRequest | null {
  const locks = (globalThis as { navigator?: { locks?: { request: LockRequest } } }).navigator?.locks
  return locks ? locks.request.bind(locks) : null
}

/** Uma transação por vez nesta aba (fila) e, com Web Locks, uma por vez entre todas as abas. */
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = () => {
    const lock = crossTabLock()
    return lock ? lock(LOCK_NAME, fn) : fn()
  }
  const result = localQueue.then(run, run)
  localQueue = result.catch(() => undefined)
  return result
}

/**
 * Transação do servidor simulado. Todo handler REST, os controles da simulação e o relógio dos pagamentos
 * passam por aqui. Não aninhe: dentro de `fn` chame as funções do db diretamente.
 */
export async function withDb<T>(fn: () => T | Promise<T>): Promise<T> {
  await initDb()
  return withLock(async () => {
    refreshFromStorage()
    // Outra aba já avisou de uma revisão que o storage desta ainda não mostra: espera chegar (nunca grava por cima).
    if ((state.rev ?? 0) < knownRev) await catchUp(knownRev)
    inTx = true
    try {
      return await fn()
    } finally {
      inTx = false
      if (dirty) commit()
      else if (pendingEvents.length) {
        // Só eventos (ex.: "Duplicar evento"): nada para gravar, mas as outras abas também os entregam.
        const events = pendingEvents
        pendingEvents = []
        post({ rev: state.rev ?? 0, events })
      }
    }
  })
}

// ---------- Eventos ----------

const eventListeners = new Set<(e: DbEvent) => void>()
const resetListeners = new Set<() => void>()
let lastEvent: DbEvent | null = null

export function onDbEvent(fn: (e: DbEvent) => void) {
  eventListeners.add(fn)
  return () => eventListeners.delete(fn)
}

/** Outra aba restaurou a seed: o servidor Socket.IO desta aba derruba as conexões (o cliente reconcilia). */
export function onRemoteReset(fn: () => void) {
  resetListeners.add(fn)
  return () => resetListeners.delete(fn)
}

export function getLastEvent() {
  return lastEvent
}

/** Entrega aos ouvintes desta aba e, se o evento nasceu aqui, leva junto na próxima mensagem às outras abas. */
function deliver(event: DbEvent) {
  eventListeners.forEach((fn) => fn(event))
  if (inTx) pendingEvents.push(event)
  else post({ rev: state.rev ?? 0, events: [event] })
}

function emit(event: DbEvent) {
  lastEvent = event
  deliver(event)
}

/** Mensagem de outra aba: recarrega se ficou para trás e entrega os mesmos eventos aqui, sem reenviar. */
export function receiveSyncMessage(message: SyncMessage) {
  if (!message || message.from === TAB_ID || !state) return
  if ((message.rev ?? 0) > (state.rev ?? 0)) {
    knownRev = Math.max(knownRev, message.rev)
    // Os eventos já trazem os dados novos; o estado acompanha assim que o storage desta aba refletir a gravação.
    if (!refreshFromStorage() || (state.rev ?? 0) < message.rev) void catchUp(message.rev)
  }
  if (message.reset) {
    lastEvent = null
    resetListeners.forEach((fn) => fn())
  }
  for (const event of message.events ?? []) {
    lastEvent = event
    eventListeners.forEach((fn) => fn(event))
  }
}

/** Liga a propagação entre abas (no navegador, em mocks/browser.ts). */
export function startDbSync() {
  if (channel || typeof BroadcastChannel === 'undefined') return
  channel = new BroadcastChannel(CHANNEL_NAME)
  channel.onmessage = (e: MessageEvent<SyncMessage>) => receiveSyncMessage(e.data)
}

export function stopDbSync() {
  channel?.close()
  channel = null
}

function nextEventId() {
  state.eventSeq += 1
  return `evt-${state.eventSeq}`
}

/** Tamanho do feed de atividade guardado (o painel mostra os mais recentes). */
export const ACTIVITY_MAX = 60

/**
 * Registra uma linha no feed do painel e a entrega como `admin.activity` (o servidor Socket.IO só repassa às
 * conexões de contas admin). Usa `deliver`, e não `emit`: o "último evento" dos controles de duplicata
 * continua sendo o de catálogo/pedido, que é o que os clientes da loja deduplicam.
 */
export function recordActivity(kind: AdminActivityKind, title: string, detail: string, resource: AdminActivity['resource']) {
  const eventId = nextEventId()
  const activity: AdminActivity = { id: eventId, occurredAt: iso(), kind, title, detail, resource }
  const log = (state.activity ??= [])
  log.push(activity)
  if (log.length > ACTIVITY_MAX) log.splice(0, log.length - ACTIVITY_MAX)
  persist()
  deliver({ type: 'admin.activity', eventId, occurredAt: activity.occurredAt, version: state.eventSeq, activity })
  return activity
}

const NETWORK_NAME: Record<Network, string> = { ethereum: 'Ethereum', polygon: 'Polygon', solana: 'Solana' }
const EDITION_STATUS_NAME = { on_sale: 'à venda', sold_out: 'esgotada', unavailable: 'indisponível' } as const

// ---------- Seed / reset ----------

function seedUser(u: (typeof SEED_USERS)[number]): StoredUser {
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    email: u.email,
    ensName: u.ensName,
    walletNickname: u.walletNickname,
    avatarUrl: null,
    createdAt: SEED_DATE,
    role: u.role,
    // Hash calculado uma vez nas fixtures: montar a seed não deriva senha nenhuma (CPU fora da carga da página).
    salt: u.salt,
    passwordHash: u.passwordHash,
  }
}

function seedCoupons(): StoredCoupon[] {
  return COUPONS.map((c) => ({ ...c, active: true, createdAt: SEED_DATE }))
}

async function buildSeed(): Promise<DbState> {
  const users: StoredUser[] = []
  const wallets: Record<string, Wallet[]> = {}
  const favorites: Record<string, string[]> = {}
  for (const u of SEED_USERS) {
    users.push(seedUser(u))
    wallets[u.id] = u.wallets.map((w) => ({ ...w, updatedAt: SEED_DATE }))
    favorites[u.id] = [...u.favorites]
  }
  return {
    schema: 1,
    users,
    sessions: [],
    passwordResets: [],
    outbox: [],
    coupons: seedCoupons(),
    activity: [],
    nfts: buildNftFixtures(),
    favorites,
    carts: {},
    wallets,
    quotes: {},
    orders: [],
    idempotency: [],
    seq: 1000,
    eventSeq: 0,
  }
}

function isUsableState(s: DbState | null): s is DbState {
  return (
    !!s &&
    s.schema === 1 &&
    Array.isArray(s.users) &&
    Array.isArray(s.sessions) &&
    Array.isArray(s.orders) &&
    Array.isArray(s.nfts) &&
    s.nfts.length > 0 &&
    s.nfts.every((n) => NftDetailSchema.safeParse(n).success)
  )
}

/**
 * Completa um estado salvo por uma versão anterior do app (sem papéis, sem a conta admin, sem cupons no
 * banco), sem apagar o que a pessoa já fez. Devolve true se mudou algo.
 */
async function migrate(s: DbState) {
  let changed = false
  for (const u of s.users) {
    if (u.role !== 'admin' && u.role !== 'user') {
      ;(u as StoredUser).role = 'user'
      changed = true
    }
  }
  for (const seed of SEED_USERS) {
    if (seed.role === 'admin' && !s.users.some((u) => u.id === seed.id)) {
      s.users.push(seedUser(seed))
      s.favorites[seed.id] ??= []
      s.wallets[seed.id] ??= []
      changed = true
    }
  }
  if (!Array.isArray(s.coupons)) {
    s.coupons = seedCoupons()
    changed = true
  }
  return changed
}

export function initDb() {
  if (!ready) {
    // Sob a trava: duas abas abertas ao mesmo tempo num navegador novo não criam duas seeds diferentes.
    ready = withLock(async () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) {
          const parsed = JSON.parse(raw) as DbState
          // Só reaproveita o estado salvo se ele ainda segue os contratos atuais. Um estado de uma
          // versão anterior (ou corrompido) faria a API simulada responder fora do contrato.
          if (isUsableState(parsed)) {
            state = parsed
            state.rev = Math.max(state.rev ?? 0, readStoredRev(), 0)
            if (await migrate(state)) persist()
            return
          }
        }
      } catch {
        /* estado corrompido: recria */
      }
      state = await buildSeed()
      state.rev = Math.max(readStoredRev(), 0)
      persist()
    })
  }
  return ready
}

/** Restaura a seed. Numa transação, as outras abas recebem `reset` e recarregam. */
export async function resetDb() {
  const rev = Math.max(state?.rev ?? 0, readStoredRev(), 0)
  state = await buildSeed()
  state.rev = rev
  lastEvent = null
  pendingEvents = []
  pendingReset = true
  persist()
}

export function getState() {
  return state
}

// ---------- Sessão e usuários ----------

export function publicUser(u: StoredUser): User {
  const { passwordHash: _h, salt: _s, ...rest } = u
  return rest
}

export function findUserByEmail(email: string) {
  return state.users.find((u) => u.email.toLowerCase() === email.toLowerCase())
}

export function findUserByUsername(username: string) {
  return state.users.find((u) => u.username.toLowerCase() === username.toLowerCase())
}

export function findUser(id: string) {
  return state.users.find((u) => u.id === id)
}

export async function createUser(input: { username: string; email: string; password: string }) {
  const salt = randomHex(16)
  const user: StoredUser = {
    id: nextId('usr'),
    name: input.username,
    username: input.username,
    email: input.email,
    ensName: input.username.replace(/_/g, '-'),
    walletNickname: 'Principal',
    avatarUrl: null,
    createdAt: iso(),
    // Cadastro público nunca cria admin: o papel não vem do corpo da requisição.
    role: 'user',
    salt,
    passwordHash: await hashPassword(input.password, salt),
  }
  state.users.push(user)
  state.favorites[user.id] = []
  state.wallets[user.id] = []
  persist()
  return user
}

export async function verifyPassword(user: StoredUser, password: string) {
  const [scheme, rawIterations] = user.passwordHash.split('$')
  let ok: boolean
  if (scheme === PASSWORD_SCHEME) {
    const iterations = Number(rawIterations)
    if (!Number.isSafeInteger(iterations) || iterations < 1) return false
    ok = constantTimeEqual(await hashPassword(password, user.salt, iterations), user.passwordHash)
    if (!ok || iterations === PASSWORD_ITERATIONS) return ok
  } else {
    // Estado salvo por uma versão anterior (SHA-256 com salt): confere e, se bater, migra abaixo.
    ok = constantTimeEqual(await legacySha256Hash(password, user.salt), user.passwordHash)
    if (!ok) return false
  }
  // Senha certa num formato antigo (ou com outra contagem de iterações): refaz no formato atual.
  await setPassword(user, password)
  return true
}

export async function setPassword(user: StoredUser, password: string) {
  user.salt = randomHex(16)
  user.passwordHash = await hashPassword(password, user.salt)
  persist()
}

export function createSession(userId: string, ttlSec: number) {
  const session: StoredSession = { token: `tok_${randomHex(24)}`, userId, expiresAt: now() + ttlSec * 1000 }
  state.sessions.push(session)
  persist()
  return session
}

export type SessionLookup = { status: 'ok'; user: StoredUser; session: StoredSession } | { status: 'missing' | 'expired' }

export function lookupSession(token: string | null): SessionLookup {
  if (!token) return { status: 'missing' }
  const session = state.sessions.find((s) => s.token === token)
  if (!session) return { status: 'missing' }
  if (session.expiresAt <= now()) return { status: 'expired' }
  const user = findUser(session.userId)
  if (!user) return { status: 'missing' }
  return { status: 'ok', user, session }
}

export function deleteSession(token: string) {
  state.sessions = state.sessions.filter((s) => s.token !== token)
  persist()
}

/** Expira todas as sessões ativas (cenário "sessão expirada"). */
export function expireAllSessions() {
  state.sessions.forEach((s) => (s.expiresAt = now() - 1))
  persist()
}

/** Encerra todas as sessões de um usuário (ex.: depois de redefinir a senha). */
export function deleteUserSessions(userId: string) {
  state.sessions = state.sessions.filter((s) => s.userId !== userId)
  persist()
}

// ---------- Recuperação de senha e e-mails simulados ----------

export const PASSWORD_RESET_TTL_MIN = 30
const OUTBOX_LIMIT = 20

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Cria um token de redefinição para o usuário e invalida os anteriores ainda pendentes
 * (só o link mais recente vale). Devolve o token em claro, que só vai no e-mail.
 */
export async function createPasswordReset(userId: string) {
  const resets = (state.passwordResets ??= [])
  const t = now()
  resets.forEach((r) => {
    if (r.userId === userId && !r.usedAt && !r.supersededAt) r.supersededAt = t
  })
  const token = `rst_${randomHex(24)}`
  resets.push({ id: nextId('rst'), userId, tokenHash: await sha256Hex(token), createdAt: t, expiresAt: t + PASSWORD_RESET_TTL_MIN * 60_000, usedAt: null, supersededAt: null })
  persist()
  return token
}

export type PasswordResetLookup =
  | { status: 'ok'; reset: StoredPasswordReset; user: StoredUser }
  | { status: 'invalid' }
  | { status: 'expired' | 'used' | 'superseded' }

export async function lookupPasswordReset(token: string): Promise<PasswordResetLookup> {
  const hash = await sha256Hex(token)
  const reset = state.passwordResets?.find((r) => r.tokenHash === hash)
  const user = reset && findUser(reset.userId)
  if (!reset || !user) return { status: 'invalid' }
  if (reset.usedAt) return { status: 'used' }
  if (reset.supersededAt) return { status: 'superseded' }
  if (reset.expiresAt <= now()) return { status: 'expired' }
  return { status: 'ok', reset, user }
}

/** Troca a senha, marca o token como usado e encerra as sessões abertas do usuário. */
export async function completePasswordReset(reset: StoredPasswordReset, user: StoredUser, password: string) {
  reset.usedAt = now()
  await setPassword(user, password)
  deleteUserSessions(user.id)
}

/** "Envia" um e-mail: guarda na caixa de saída simulada (as últimas 20 mensagens). */
export function sendEmail(email: Omit<SimulatedEmail, 'id' | 'sentAt'>) {
  const outbox = (state.outbox ??= [])
  const message: SimulatedEmail = { ...email, id: nextId('mail'), sentAt: iso() }
  outbox.push(message)
  if (outbox.length > OUTBOX_LIMIT) outbox.splice(0, outbox.length - OUTBOX_LIMIT)
  persist()
  return message
}

/** Vence todos os links de redefinição pendentes (testa o "link expirado" sem esperar 30 min). */
export function expirePasswordResets() {
  state.passwordResets?.forEach((r) => (r.expiresAt = Math.min(r.expiresAt, now() - 1)))
  persist()
}

/** Último e-mail enviado (opcionalmente só para um destinatário). */
export function lastEmail(to?: string) {
  const outbox = state.outbox ?? []
  for (let i = outbox.length - 1; i >= 0; i--) {
    if (!to || outbox[i].to.toLowerCase() === to.trim().toLowerCase()) return outbox[i]
  }
  return null
}

export function updateUser(user: StoredUser, patch: Partial<Pick<User, 'name' | 'username' | 'email' | 'ensName' | 'walletNickname' | 'avatarUrl'>>) {
  Object.assign(user, patch)
  persist()
}

// ---------- Catálogo ----------

export function toSummary(n: NftDetail): NftSummary {
  const { description: _d, gallery: _g, editions: _e, attributes: _a, contract: _c, tokenStandard: _t, ...summary } = n
  return summary
}

export function findNft(id: string) {
  return state.nfts.find((n) => n.id === id)
}

function recomputeNft(n: NftDetail) {
  n.editions.forEach((e) => {
    if (e.status !== 'unavailable') e.status = e.available > 0 ? 'on_sale' : 'sold_out'
  })
  const onSale = n.editions.filter((e) => e.status === 'on_sale')
  const pool = onSale.length ? onSale : n.editions
  n.price = pool.reduce((m, e) => (compareEth(e.price, m) < 0 ? e.price : m), pool[0].price)
  n.available = onSale.reduce((s, e) => s + e.available, 0)
  n.version += 1
}

function emitNftUpdated(n: NftDetail, previousPrice: string) {
  emit({
    type: 'nft.updated',
    eventId: nextEventId(),
    occurredAt: iso(),
    version: n.version,
    resource: { type: 'nft', id: n.id },
    data: {
      price: n.price,
      available: n.available,
      editions: n.editions.map(({ id, price, available, status }) => ({ id, price, available, status })),
      featured: n.featured,
      previousPrice,
    },
  })
}

/** Carrinhos com este NFT: totais e avisos são recalculados na leitura; a versão sobe para quem compara. */
function touchCartsWith(nftId: string) {
  Object.values(state.carts).forEach((c) => {
    if (c.items.some((i) => i.nftId === nftId)) touchCart(c)
  })
}

export type EditionPatch = { price?: string; available?: number; status?: 'on_sale' | 'unavailable' }

/** Altera preço, estoque e/ou status de uma edição, recalcula o NFT e os carrinhos afetados e publica `nft.updated`. */
export function updateEdition(nftId: string, editionId: string, patch: EditionPatch) {
  const n = findNft(nftId)
  const e = n?.editions.find((x) => x.id === editionId)
  if (!n || !e) return null
  const previousPrice = n.price
  const before = { price: e.price, available: e.available, status: e.status }
  if (patch.price !== undefined) e.price = toEthString(patch.price)
  if (patch.available !== undefined) e.available = Math.max(0, patch.available)
  // "À venda" volta a valer pelo estoque (0 = esgotada); "Indisponível" tira de venda mesmo com estoque.
  if (patch.status !== undefined) e.status = patch.status === 'unavailable' ? 'unavailable' : e.available > 0 ? 'on_sale' : 'sold_out'
  recomputeNft(n)
  touchCartsWith(n.id)
  persist()
  emitNftUpdated(n, previousPrice)
  const label = `${n.name} · edição ${e.name}`
  const resource = { type: 'nft', id: n.id } as const
  if (compareEth(before.price, e.price) !== 0) recordActivity('nft.price', `Preço alterado: ${label}`, `${before.price} ETH → ${e.price} ETH`, resource)
  if (before.available !== e.available) recordActivity('nft.stock', `Estoque alterado: ${label}`, `${before.available} → ${e.available} de ${e.supply}`, resource)
  // Esgotar ou voltar do esgotado é consequência do estoque (a linha acima já conta); aqui só a escolha do painel.
  const followsStock = before.available !== e.available && (before.status === 'sold_out' || e.status === 'sold_out')
  if (before.status !== e.status && !followsStock) {
    recordActivity('nft.status', `Status alterado: ${label}`, `${EDITION_STATUS_NAME[before.status]} → ${EDITION_STATUS_NAME[e.status]}`, resource)
  }
  return n
}

/** Liga/desliga o destaque na vitrine e publica `nft.updated` (com `featured`). */
export function setFeatured(nftId: string, featured: boolean) {
  const n = findNft(nftId)
  if (!n) return null
  n.featured = featured
  n.version += 1
  persist()
  emitNftUpdated(n, n.price)
  recordActivity('nft.featured', featured ? `Destaque ligado: ${n.name}` : `Destaque desligado: ${n.name}`, featured ? 'Passa a aparecer na vitrine da loja' : 'Saiu da vitrine da loja', { type: 'nft', id: n.id })
  return n
}

// ---------- Painel administrativo ----------

export type AdminUpdateResult =
  | { ok: true; nft: NftDetail }
  | { ok: false; code: 'NOT_FOUND'; message: string }
  | { ok: false; code: 'VERSION_MISMATCH'; current: NftDetail }
  | { ok: false; code: 'VALIDATION_ERROR'; fields: Record<string, string> }

/**
 * Edição pelo painel, com controle de concorrência otimista: `version` é a versão do NFT que o admin leu.
 * Se o NFT mudou desde então (outra aba, outro admin, uma compra que reservou estoque), recusa e devolve o atual.
 */
export function adminUpdateEdition(nftId: string, editionId: string, patch: AdminEditionPatch): AdminUpdateResult {
  const n = findNft(nftId)
  const e = n?.editions.find((x) => x.id === editionId)
  if (!n || !e) return { ok: false, code: 'NOT_FOUND', message: 'NFT ou edição não encontrada' }
  if (patch.version !== n.version) return { ok: false, code: 'VERSION_MISMATCH', current: n }
  if (patch.available !== undefined && patch.available > e.supply) {
    return { ok: false, code: 'VALIDATION_ERROR', fields: { available: `Máximo de ${e.supply} (tiragem da edição)` } }
  }
  const { version: _v, ...changes } = patch
  return { ok: true, nft: updateEdition(nftId, editionId, changes)! }
}

export function adminSetFeatured(nftId: string, version: number, featured: boolean): AdminUpdateResult {
  const n = findNft(nftId)
  if (!n) return { ok: false, code: 'NOT_FOUND', message: 'NFT não encontrado' }
  if (version !== n.version) return { ok: false, code: 'VERSION_MISMATCH', current: n }
  return { ok: true, nft: setFeatured(nftId, featured)! }
}

/** Envia de novo o último evento (mesmo eventId) — testa tolerância a duplicatas. */
export function reemitLastEvent() {
  if (lastEvent) deliver(lastEvent)
  return lastEvent
}

/** Envia um evento com versão antiga e dados divergentes — o cliente deve ignorar. */
export function emitStaleNftEvent(nftId: string) {
  const n = findNft(nftId)
  if (!n) return null
  const event: NftUpdatedEvent = {
    type: 'nft.updated',
    eventId: nextEventId(),
    occurredAt: iso(now() - 60_000),
    version: Math.max(0, n.version - 1),
    resource: { type: 'nft', id: n.id },
    data: {
      price: '999',
      available: 0,
      editions: n.editions.map(({ id, status }) => ({ id, price: '999', available: 0, status })),
    },
  }
  deliver(event)
  return event
}

// ---------- Favoritos ----------

export function getFavorites(userId: string) {
  return (state.favorites[userId] ??= [])
}

export function setFavorite(userId: string, nftId: string, value: boolean) {
  const list = getFavorites(userId)
  const has = list.includes(nftId)
  const n = findNft(nftId)
  if (value && !has) {
    list.push(nftId)
    if (n) n.likes += 1
  }
  if (!value && has) {
    state.favorites[userId] = list.filter((id) => id !== nftId)
    if (n) n.likes = Math.max(0, n.likes - 1)
  }
  persist()
  return state.favorites[userId]
}

// ---------- Carrinho ----------

/**
 * Busca por chave vinda da requisição (cabeçalho, corpo): só chaves próprias do registro, então
 * "__proto__", "constructor" e afins não devolvem o protótipo de Object no lugar de um carrinho ou cotação.
 */
function ownEntry<T>(record: Record<string, T>, key: string | null | undefined): T | undefined {
  return key && Object.hasOwn(record, key) ? record[key] : undefined
}

/** Carrinho de visitante pelo id (nunca o carrinho de uma conta, mesmo que o id bata). */
function findGuestCart(id: string | null | undefined) {
  const cart = ownEntry(state.carts, id)
  return cart && !cart.userId ? cart : undefined
}

export function getOrCreateCart(opts: { userId: string | null; guestCartId: string | null }): StoredCart {
  if (opts.userId) {
    const existing = Object.values(state.carts).find((c) => c.userId === opts.userId)
    if (existing) return existing
    const cart: StoredCart = { id: nextId('cart'), userId: opts.userId, items: [], couponCode: null, version: 1, updatedAt: iso() }
    state.carts[cart.id] = cart
    persist()
    return cart
  }
  const guest = findGuestCart(opts.guestCartId)
  if (guest) return guest
  // O id do carrinho de visitante é a credencial dele (vai no X-Cart-Id): aleatório de 128 bits, não sequencial.
  const cart: StoredCart = { id: `guest-${randomHex(16)}`, userId: null, items: [], couponCode: null, version: 1, updatedAt: iso() }
  state.carts[cart.id] = cart
  persist()
  return cart
}

function touchCart(cart: StoredCart) {
  cart.version += 1
  cart.updatedAt = iso()
  persist()
}

export type CartError =
  | { code: 'NOT_FOUND'; message: string }
  | { code: 'AVAILABILITY_CONFLICT'; message: string; available: number }

export function addCartItem(cart: StoredCart, nftId: string, editionId: string, quantity: number): CartError | null {
  const n = findNft(nftId)
  const e = n?.editions.find((x) => x.id === editionId)
  if (!n || !e) return { code: 'NOT_FOUND', message: 'NFT ou edição não encontrada' }
  if (e.status !== 'on_sale') return { code: 'AVAILABILITY_CONFLICT', message: 'Esta edição não está à venda', available: 0 }
  const existing = cart.items.find((i) => i.nftId === nftId && i.editionId === editionId)
  const desired = (existing?.quantity ?? 0) + quantity
  const limit = Math.min(e.available, e.maxPerOrder)
  if (desired > limit) {
    return {
      code: 'AVAILABILITY_CONFLICT',
      message: `Só é possível ter ${limit} unidade(s) desta edição no carrinho`,
      available: limit,
    }
  }
  if (existing) {
    existing.quantity = desired
    existing.priceWhenAdded = e.price
  } else {
    cart.items.push({ id: nextId('ci'), nftId, editionId, quantity, priceWhenAdded: e.price })
  }
  touchCart(cart)
  return null
}

export function updateCartItem(cart: StoredCart, itemId: string, quantity: number): CartError | null {
  const item = cart.items.find((i) => i.id === itemId)
  if (!item) return { code: 'NOT_FOUND', message: 'Item não está no carrinho' }
  const e = findNft(item.nftId)?.editions.find((x) => x.id === item.editionId)
  const limit = e && e.status === 'on_sale' ? Math.min(e.available, e.maxPerOrder) : 0
  if (quantity > limit) {
    return { code: 'AVAILABILITY_CONFLICT', message: `Disponível: ${limit} unidade(s)`, available: limit }
  }
  item.quantity = quantity
  touchCart(cart)
  return null
}

export function removeCartItem(cart: StoredCart, itemId: string) {
  const before = cart.items.length
  cart.items = cart.items.filter((i) => i.id !== itemId)
  if (cart.items.length !== before) touchCart(cart)
  return cart.items.length !== before
}

/** "Aceito o novo preço": atualiza priceWhenAdded para o preço atual de cada item. */
export function acknowledgeCartPrices(cart: StoredCart) {
  cart.items.forEach((i) => {
    const e = findNft(i.nftId)?.editions.find((x) => x.id === i.editionId)
    if (e) i.priceWhenAdded = e.price
  })
  touchCart(cart)
}

export function mergeCarts(guestCartId: string, userCart: StoredCart) {
  const guest = findGuestCart(guestCartId)
  if (!guest) return
  for (const gi of guest.items) {
    const e = findNft(gi.nftId)?.editions.find((x) => x.id === gi.editionId)
    if (!e || e.status !== 'on_sale') continue
    const limit = Math.min(e.available, e.maxPerOrder)
    const existing = userCart.items.find((i) => i.nftId === gi.nftId && i.editionId === gi.editionId)
    if (existing) existing.quantity = Math.min(limit, Math.max(existing.quantity, gi.quantity))
    else userCart.items.push({ ...gi, id: nextId('ci'), quantity: Math.min(limit, gi.quantity) })
  }
  if (!userCart.couponCode && guest.couponCode) userCart.couponCode = guest.couponCode
  delete state.carts[guestCartId]
  touchCart(userCart)
}

export type CouponCheck = { ok: true; coupon: Coupon } | { ok: false; code: 'COUPON_INVALID' | 'COUPON_EXPIRED'; message: string }

function getCoupons() {
  return (state.coupons ??= seedCoupons())
}

function findCoupon(code: string) {
  const normalized = code.trim().toUpperCase()
  return getCoupons().find((x) => x.code === normalized)
}

function isExpired(c: StoredCoupon) {
  return c.expiresAt !== null && new Date(c.expiresAt).getTime() < now()
}

function publicCoupon(c: StoredCoupon): Coupon {
  return {
    code: c.code,
    description: c.description,
    percentOff: c.kind === 'percent' ? c.value : null,
    amountOff: c.kind === 'fixed' ? c.value : null,
  }
}

export function checkCoupon(code: string): CouponCheck {
  const c = findCoupon(code)
  if (!c) return { ok: false, code: 'COUPON_INVALID', message: 'Cupom inválido' }
  if (!c.active) return { ok: false, code: 'COUPON_INVALID', message: 'Este cupom foi desativado' }
  if (isExpired(c)) return { ok: false, code: 'COUPON_EXPIRED', message: 'Este cupom expirou' }
  return { ok: true, coupon: publicCoupon(c) }
}

// ---------- Cupons (painel) ----------

export function adminCoupon(c: StoredCoupon): AdminCoupon {
  return { ...c, status: !c.active ? 'inactive' : isExpired(c) ? 'expired' : 'active' }
}

/** Mais recentes primeiro; os da seed (mesma data) por código. */
export function listCoupons() {
  return [...getCoupons()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.code.localeCompare(b.code)).map(adminCoupon)
}

export type CouponCreateResult = { ok: true; coupon: AdminCoupon } | { ok: false; code: 'CONFLICT' | 'VALIDATION_ERROR'; fields: Record<string, string> }

export function createCoupon(input: CouponCreateInput): CouponCreateResult {
  if (findCoupon(input.code)) return { ok: false, code: 'CONFLICT', fields: { code: 'Já existe um cupom com este código' } }
  if (input.expiresAt && new Date(input.expiresAt).getTime() <= now()) {
    return { ok: false, code: 'VALIDATION_ERROR', fields: { expiresAt: 'A validade precisa ser uma data futura' } }
  }
  const value = toEthString(input.value)
  const coupon: StoredCoupon = {
    code: input.code,
    kind: input.kind,
    value,
    description: input.kind === 'percent' ? `${value}% de desconto` : `${value} ETH de desconto`,
    expiresAt: input.expiresAt ? new Date(input.expiresAt).toISOString() : null,
    active: true,
    createdAt: iso(),
  }
  getCoupons().push(coupon)
  persist()
  recordActivity('coupon.created', `Cupom ${coupon.code} criado`, coupon.description, { type: 'coupon', id: coupon.code })
  return { ok: true, coupon: adminCoupon(coupon) }
}

/**
 * Desativa (idempotente). Carrinhos com o cupom perdem o desconto (recalculados) e as cotações abertas com
 * ele são descartadas: confirmar o pedido responde 409 QUOTE_OUTDATED com a cotação nova, sem o desconto.
 */
export function deactivateCoupon(code: string) {
  const c = findCoupon(code)
  if (!c) return null
  if (c.active) {
    c.active = false
    Object.values(state.carts).forEach((cart) => {
      if (cart.couponCode === c.code) {
        cart.couponCode = null
        touchCart(cart)
      }
    })
    Object.entries(state.quotes).forEach(([id, q]) => {
      if (q.coupon?.code === c.code) delete state.quotes[id]
    })
    persist()
    recordActivity('coupon.deactivated', `Cupom ${c.code} desativado`, 'Carrinhos com ele perderam o desconto', { type: 'coupon', id: c.code })
  }
  return adminCoupon(c)
}

export function setCartCoupon(cart: StoredCart, code: string | null) {
  cart.couponCode = code
  touchCart(cart)
}

function priceLines(items: StoredCartItem[]) {
  return items.flatMap((i) => {
    const n = findNft(i.nftId)
    const e = n?.editions.find((x) => x.id === i.editionId)
    if (!n || !e) return []
    return [{ item: i, nft: n, edition: e, lineTotal: mulEth(e.price, i.quantity) }]
  })
}

/** Desconto do cupom: percentual (arredondado para baixo) ou valor fixo, nunca maior que o subtotal. */
function discountOf(subtotal: string, coupon: Coupon | null) {
  if (coupon?.percentOff) return percentOf(subtotal, coupon.percentOff)
  if (coupon?.amountOff) return compareEth(coupon.amountOff, subtotal) < 0 ? toEthString(coupon.amountOff) : subtotal
  return '0'
}

function totals(subtotal: string, coupon: Coupon | null, network: Network | null, hasItems: boolean) {
  const discount = discountOf(subtotal, coupon)
  const networkFee = hasItems ? NETWORK_FEES[network ?? 'ethereum'] : '0'
  const total = addEth(subEth(subtotal, discount), networkFee)
  return { subtotal, discount, networkFee, total }
}

export function serializeCart(cart: StoredCart, network: Network | null = null): Cart {
  // Cupom que expirou depois de aplicado deixa de valer automaticamente.
  let coupon: Coupon | null = null
  if (cart.couponCode) {
    const check = checkCoupon(cart.couponCode)
    if (check.ok) coupon = check.coupon
  }
  const lines = priceLines(cart.items)
  const items: CartItem[] = lines.map(({ item, nft, edition, lineTotal }) => {
    const limit = edition.status === 'on_sale' ? Math.min(edition.available, edition.maxPerOrder) : 0
    let issue: CartItem['issue'] = null
    if (limit === 0) issue = 'sold_out'
    else if (item.quantity > limit) issue = 'insufficient_stock'
    else if (compareEth(item.priceWhenAdded, edition.price) !== 0) issue = 'price_changed'
    return {
      id: item.id,
      nftId: nft.id,
      editionId: edition.id,
      name: nft.name,
      editionName: edition.name,
      image: nft.image,
      collection: nft.collection,
      network: nft.network,
      quantity: item.quantity,
      unitPrice: edition.price,
      priceWhenAdded: item.priceWhenAdded,
      available: edition.available,
      maxPerOrder: edition.maxPerOrder,
      lineTotal,
      issue,
    }
  })
  const subtotal = addEth(...items.filter((i) => i.issue !== 'sold_out').map((i) => i.lineTotal))
  return {
    id: cart.id,
    owner: cart.userId ? 'user' : 'guest',
    items,
    coupon,
    // Taxa de rede da rede pedida (sem rede: a padrão, Ethereum). O pagamento pede a da rede escolhida.
    summary: totals(subtotal, coupon, network, items.length > 0),
    version: cart.version,
    updatedAt: cart.updatedAt,
  }
}

// ---------- Cotação ----------

export type QuoteResult =
  | { ok: true; quote: StoredQuote }
  | { ok: false; code: 'AVAILABILITY_CONFLICT' | 'COUPON_INVALID' | 'COUPON_EXPIRED' | 'VALIDATION_ERROR'; message: string; details?: unknown }

export async function buildQuote(userId: string, cart: StoredCart, network: Network, couponCode: string | null): Promise<QuoteResult> {
  if (cart.items.length === 0) return { ok: false, code: 'VALIDATION_ERROR', message: 'O carrinho está vazio' }
  let coupon: Coupon | null = null
  if (couponCode) {
    const check = checkCoupon(couponCode)
    if (!check.ok) return { ok: false, code: check.code, message: check.message }
    coupon = check.coupon
  }
  const lines = priceLines(cart.items)
  const problems = lines.filter(({ item, edition }) => edition.status !== 'on_sale' || item.quantity > Math.min(edition.available, edition.maxPerOrder))
  if (problems.length) {
    return {
      ok: false,
      code: 'AVAILABILITY_CONFLICT',
      message: 'Alguns itens não têm mais a quantidade desejada disponível',
      details: problems.map(({ item, edition }) => ({ itemId: item.id, available: edition.status === 'on_sale' ? edition.available : 0 })),
    }
  }
  const quoteLines: QuoteLine[] = lines.map(({ item, nft, edition, lineTotal }) => ({
    nftId: nft.id,
    editionId: edition.id,
    name: nft.name,
    editionName: edition.name,
    image: nft.image,
    quantity: item.quantity,
    unitPrice: edition.price,
    lineTotal,
  }))
  const t = totals(addEth(...quoteLines.map((l) => l.lineTotal)), coupon, network, true)
  const fingerprint = await stableHash({ quoteLines, coupon: coupon?.code ?? null, network, ...t })
  const quote: StoredQuote = {
    id: nextId('qt'),
    userId,
    cartId: cart.id,
    network,
    lines: quoteLines,
    coupon,
    ...t,
    fingerprint,
    expiresAt: iso(now() + 10 * 60_000),
  }
  state.quotes[quote.id] = quote
  persist()
  return { ok: true, quote }
}

export function publicQuote(q: StoredQuote): Quote {
  const { userId: _u, cartId: _c, ...rest } = q
  return rest
}

export function findQuote(id: string) {
  return ownEntry(state.quotes, id)
}

// ---------- Pedidos ----------

export function publicOrder(o: StoredOrder): Order {
  const { outcome: _o, settleAt: _s, ...rest } = o
  return rest
}

export function findOrder(id: string) {
  return state.orders.find((o) => o.id === id)
}

export function findIdempotency(userId: string, key: string) {
  return state.idempotency.find((r) => r.userId === userId && r.key === key)
}

export function createOrder(params: {
  userId: string
  key: string
  requestHash: string
  quote: StoredQuote
  wallet: Wallet
  provider: Wallet['provider']
  collector: Order['collector']
  outcome: 'approve' | 'reject'
  paymentDelayMs: number
}) {
  const { quote } = params
  // Reserva o estoque enquanto o pagamento é processado (evita vender a mesma unidade duas vezes).
  const previousPrices = new Map<string, string>()
  for (const line of quote.lines) {
    const n = findNft(line.nftId)
    const e = n?.editions.find((x) => x.id === line.editionId)
    if (n && e) {
      if (!previousPrices.has(n.id)) previousPrices.set(n.id, n.price)
      e.available = Math.max(0, e.available - line.quantity)
      recomputeNft(n)
    }
  }
  const order: StoredOrder = {
    id: nextId('ord'),
    number: `JG-${String(state.orders.length + 1).padStart(5, '0')}`,
    userId: params.userId,
    status: 'pending',
    failureReason: null,
    network: quote.network,
    wallet: { id: params.wallet.id, nickname: params.wallet.nickname, address: params.wallet.address, provider: params.provider },
    collector: params.collector,
    lines: quote.lines.map((l) => ({ ...l })),
    coupon: quote.coupon,
    subtotal: quote.subtotal,
    discount: quote.discount,
    networkFee: quote.networkFee,
    total: quote.total,
    txHash: null,
    explorerUrl: null,
    createdAt: iso(),
    updatedAt: iso(),
    version: 1,
    outcome: params.outcome,
    settleAt: now() + params.paymentDelayMs,
  }
  state.orders.push(order)
  state.idempotency.push({ userId: params.userId, key: params.key, requestHash: params.requestHash, orderId: order.id })
  delete state.quotes[quote.id]
  persist()
  for (const line of quote.lines) {
    const n = findNft(line.nftId)
    if (n) emitNftUpdated(n, previousPrices.get(n.id) ?? n.price)
  }
  recordActivity('order.created', `Pedido ${order.number} recebido`, orderActivityDetail(order), { type: 'order', id: order.id })
  return order
}

/** "ana_nft · 2 itens · 1.19 ETH · Ethereum" (sem e-mail nem endereço de carteira). */
function orderActivityDetail(order: StoredOrder) {
  const user = state.users.find((u) => u.id === order.userId)
  const items = order.lines.reduce((s, l) => s + l.quantity, 0)
  return `${user?.username ?? 'conta removida'} · ${items} ${items === 1 ? 'item' : 'itens'} · ${order.total} ETH · ${NETWORK_NAME[order.network]}`
}

function dueOrders() {
  return state ? state.orders.filter((o) => o.status === 'pending' && o.settleAt <= now()) : []
}

/**
 * Processa pagamentos cujo prazo venceu. Idempotente: só mexe em pedido ainda `pending`.
 * No navegador roda dentro de `withDb` (ver `settleDueOrdersShared`): com várias abas abertas, a primeira a
 * pegar a trava liquida; as outras releem o estado, já não veem o pedido pendente e não fazem nada.
 */
export function settleDueOrders() {
  if (!state) return
  for (const order of dueOrders()) {
    if (order.outcome === 'approve') {
      order.status = 'confirmed'
      order.txHash = `0x${randomHex(32)}`
      order.explorerUrl = explorerUrl(order.network, order.txHash)
      // Remove do carrinho só os itens e quantidades comprados.
      const cart = Object.values(state.carts).find((c) => c.userId === order.userId)
      if (cart) {
        for (const line of order.lines) {
          const item = cart.items.find((i) => i.nftId === line.nftId && i.editionId === line.editionId)
          if (!item) continue
          item.quantity -= line.quantity
        }
        cart.items = cart.items.filter((i) => i.quantity > 0)
        // O cupom continua valendo para o que sobrou no carrinho; só sai se o carrinho ficou vazio ou se o
        // cupom deixou de valer (expirou ou foi desativado). Os totais são recalculados na leitura
        // (serializeCart) e a próxima cotação já sai com o desconto sobre os itens restantes; uma cotação
        // antiga deste carrinho não passa mais no POST /orders (fingerprint diferente: QUOTE_OUTDATED).
        if (cart.couponCode && (cart.items.length === 0 || !checkCoupon(cart.couponCode).ok)) cart.couponCode = null
        touchCart(cart)
      }
    } else {
      order.status = 'rejected'
      order.failureReason = 'Pagamento recusado pela carteira: saldo insuficiente (simulado)'
      // Devolve o estoque reservado.
      for (const line of order.lines) {
        const n = findNft(line.nftId)
        const e = n?.editions.find((x) => x.id === line.editionId)
        if (n && e) {
          const previousPrice = n.price
          e.available += line.quantity
          recomputeNft(n)
          emitNftUpdated(n, previousPrice)
        }
      }
    }
    order.version += 1
    order.updatedAt = iso()
    persist()
    emit({
      type: 'order.updated',
      eventId: nextEventId(),
      occurredAt: iso(),
      version: order.version,
      resource: { type: 'order', id: order.id },
      userId: order.userId,
      data: { status: order.status, failureReason: order.failureReason, txHash: order.txHash },
    })
    if (order.status === 'confirmed') recordActivity('order.confirmed', `Pedido ${order.number} confirmado`, orderActivityDetail(order), { type: 'order', id: order.id })
    else recordActivity('order.rejected', `Pedido ${order.number} recusado`, orderActivityDetail(order), { type: 'order', id: order.id })
  }
}

let settling = false

/** Relógio dos pagamentos no navegador: confere barato e só pega a trava quando há pedido vencido. */
export async function settleDueOrdersShared() {
  if (settling || !state) return
  refreshFromStorage()
  if (dueOrders().length === 0) return
  settling = true
  try {
    await withDb(() => settleDueOrders())
  } finally {
    settling = false
  }
}

// ---------- Carteiras ----------

export function getWallets(userId: string) {
  return (state.wallets[userId] ??= [])
}

export function upsertWallet(userId: string, input: Omit<Wallet, 'id' | 'updatedAt'>, id?: string) {
  const list = getWallets(userId)
  // Só existe uma principal e uma secundária: cadastrar de novo o mesmo papel substitui.
  const existing = id ? list.find((w) => w.id === id) : list.find((w) => w.role === input.role)
  if (existing) {
    if (existing.role !== input.role) {
      const other = list.find((w) => w.role === input.role && w.id !== existing.id)
      if (other) other.role = existing.role // troca os papéis
    }
    Object.assign(existing, input, { updatedAt: iso() })
    persist()
    return existing
  }
  const wallet: Wallet = { ...input, id: nextId('wal'), updatedAt: iso() }
  list.push(wallet)
  persist()
  return wallet
}
