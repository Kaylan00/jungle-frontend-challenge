/**
 * Contratos únicos entre transporte (REST/Socket.IO), estado (TanStack Query) e interface.
 *
 * Os mesmos schemas são usados:
 *  - pelo cliente Axios, para validar o que chega da rede (parse na borda);
 *  - pelos handlers MSW, para montar as respostas simuladas.
 * Assim um mock nunca devolve um formato que a aplicação não entende.
 */
import { z } from 'zod'

/** Valor em ETH trafega sempre como string decimal (até 18 casas), nunca como number. */
export const EthAmount = z.string().regex(/^\d+(\.\d{1,18})?$/, 'Valor ETH inválido')
export type EthAmount = z.infer<typeof EthAmount>

export const Network = z.enum(['ethereum', 'polygon', 'solana'])
export type Network = z.infer<typeof Network>

export const Category = z.enum([
  'arte-digital',
  'fotografia',
  'musica',
  'arte-3d',
  'colecionaveis',
  'generativa',
  'jogos',
  'assinaturas',
  'utilidade',
])
export type Category = z.infer<typeof Category>

export const SortOption = z.enum(['relevance', 'recent', 'price_asc', 'price_desc', 'popular'])
export type SortOption = z.infer<typeof SortOption>

// ---------- Erros ----------

export const ApiErrorCode = z.enum([
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'SESSION_EXPIRED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'EMAIL_TAKEN',
  'AVAILABILITY_CONFLICT',
  'QUOTE_OUTDATED',
  'COUPON_INVALID',
  'COUPON_EXPIRED',
  'IDEMPOTENCY_CONFLICT',
  'WALLET_REJECTED',
  'INVALID_CREDENTIALS',
  'RESET_TOKEN_INVALID',
  'RESET_TOKEN_EXPIRED',
  'TRANSIENT_FAILURE',
  'INTERNAL_ERROR',
])
export type ApiErrorCode = z.infer<typeof ApiErrorCode>

export const ApiErrorBody = z.object({
  error: z.object({
    code: ApiErrorCode,
    message: z.string(),
    /** Erros por campo, ex.: { email: 'E-mail já cadastrado' } */
    fields: z.record(z.string(), z.string()).optional(),
    /** Dados extras, ex.: a nova cotação quando QUOTE_OUTDATED */
    details: z.unknown().optional(),
  }),
})
export type ApiErrorBody = z.infer<typeof ApiErrorBody>

// ---------- Usuário e sessão ----------

export const User = z.object({
  id: z.string(),
  name: z.string(),
  username: z.string(),
  email: z.string().email(),
  ensName: z.string(),
  walletNickname: z.string(),
  avatarUrl: z.string().nullable(),
  createdAt: z.string(),
})
export type User = z.infer<typeof User>

export const Session = z.object({
  token: z.string(),
  expiresAt: z.string(),
  user: User,
})
export type Session = z.infer<typeof Session>

export const LoginInput = z.object({
  email: z.string().trim().email('Informe um e-mail válido'),
  password: z.string().min(1, 'Informe sua senha'),
})
export type LoginInput = z.infer<typeof LoginInput>

const passwordRule = z
  .string()
  .min(8, 'A senha precisa ter pelo menos 8 caracteres')
  .regex(/[A-Za-z]/, 'Use pelo menos uma letra')
  .regex(/\d/, 'Use pelo menos um número')

const usernameRule = z
  .string()
  .trim()
  .min(3, 'Mínimo de 3 caracteres')
  .max(20, 'Máximo de 20 caracteres')
  .regex(/^[a-z0-9_]+$/, 'Use letras minúsculas, números e _')

/** Corpo enviado para POST /auth/signup */
export const SignupRequest = z.object({
  username: usernameRule,
  email: z.string().trim().email('Informe um e-mail válido'),
  password: passwordRule,
})
export type SignupRequest = z.infer<typeof SignupRequest>

/** Formulário "Criar conta" (a confirmação de senha não vai para a API) */
export const SignupInput = SignupRequest.extend({ confirmPassword: z.string().min(1, 'Confirme sua senha') }).refine(
  (v) => v.password === v.confirmPassword,
  { path: ['confirmPassword'], message: 'As senhas não conferem' },
)
export type SignupInput = z.infer<typeof SignupInput>

// ---------- Recuperação de senha ----------

/** Corpo de POST /auth/password-reset (pedido do link por e-mail). */
export const PasswordResetRequest = z.object({
  email: z.string().trim().email('Informe um e-mail válido'),
})
export type PasswordResetRequest = z.infer<typeof PasswordResetRequest>

/**
 * 202 de POST /auth/password-reset. A mensagem é sempre a mesma, exista ou não a conta:
 * a resposta não pode servir para descobrir quais e-mails estão cadastrados.
 */
export const PasswordResetAccepted = z.object({
  message: z.string(),
  /** Validade do link em minutos (informativa, igual para todos) */
  expiresInMinutes: z.number().int().positive(),
})
export type PasswordResetAccepted = z.infer<typeof PasswordResetAccepted>

/** 200 de GET /auth/password-reset/:token: o link ainda vale. E-mail mascarado (a***@dominio). */
export const PasswordResetTokenInfo = z.object({
  email: z.string(),
  expiresAt: z.string(),
})
export type PasswordResetTokenInfo = z.infer<typeof PasswordResetTokenInfo>

/** Corpo de POST /auth/password-reset/confirm. Mesmas regras de senha do cadastro. */
export const PasswordResetConfirmRequest = z.object({
  token: z.string().min(1, 'Link inválido'),
  password: passwordRule,
})
export type PasswordResetConfirmRequest = z.infer<typeof PasswordResetConfirmRequest>

/** 200 de POST /auth/password-reset/confirm */
export const PasswordResetDone = z.object({ message: z.string() })
export type PasswordResetDone = z.infer<typeof PasswordResetDone>

/** Formulário "Criar nova senha" (a confirmação não vai para a API) */
export const PasswordResetForm = z
  .object({
    password: passwordRule,
    confirmPassword: z.string().min(1, 'Confirme sua senha'),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'As senhas não conferem' })
export type PasswordResetForm = z.infer<typeof PasswordResetForm>

/** Nome ENS sem o sufixo .eth (o sufixo é fixo no layout) */
const ensRule = z
  .string()
  .trim()
  .min(3, 'Mínimo de 3 caracteres')
  .max(32, 'Máximo de 32 caracteres')
  .regex(/^[a-z0-9-]+$/, 'Use letras minúsculas, números e hífen')

export const ProfileInput = z.object({
  name: z.string().trim().min(2, 'Informe seu nome de exibição'),
  username: usernameRule,
  email: z.string().trim().email('Informe um e-mail válido'),
  ensName: ensRule,
  walletNickname: z.string().trim().min(2, 'Informe o apelido da carteira').max(30, 'Máximo de 30 caracteres'),
})
export type ProfileInput = z.infer<typeof ProfileInput>

export const PasswordChangeInput = z
  .object({
    currentPassword: z.string().min(1, 'Informe a senha atual'),
    newPassword: passwordRule,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'As senhas não conferem',
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ['newPassword'],
    message: 'A nova senha precisa ser diferente da atual',
  })
export type PasswordChangeInput = z.infer<typeof PasswordChangeInput>

/** Avatar trafega como data URL (PNG/JPEG/WebP até 1 MB). */
export const AvatarInput = z.object({
  dataUrl: z.string().regex(/^data:image\/(png|jpeg|webp);base64,/, 'Formato de imagem não suportado'),
})

// ---------- NFTs ----------

export const Edition = z.object({
  id: z.string(),
  /** Ex.: "Edição Genesis", "Edição Ouro" */
  name: z.string(),
  price: EthAmount,
  /** Unidades ainda à venda */
  available: z.number().int().nonnegative(),
  supply: z.number().int().positive(),
  /** Limite por pedido */
  maxPerOrder: z.number().int().positive(),
  status: z.enum(['on_sale', 'sold_out', 'unavailable']),
})
export type Edition = z.infer<typeof Edition>

export const Creator = z.object({
  id: z.string(),
  name: z.string(),
  avatarUrl: z.string(),
  verified: z.boolean(),
})

export const NftSummary = z.object({
  id: z.string(),
  name: z.string(),
  collection: z.string(),
  creator: Creator,
  image: z.string(),
  category: Category,
  network: Network,
  /** Menor preço entre as edições à venda */
  price: EthAmount,
  available: z.number().int().nonnegative(),
  /** Preço "de" riscado quando a edição está com desconto */
  compareAtPrice: EthAmount.nullable(),
  tokenId: z.string(),
  badge: z.enum(['raro', 'novo']).nullable(),
  rating: z.number().min(0).max(5),
  reviewsCount: z.number().int().nonnegative(),
  likes: z.number().int().nonnegative(),
  featured: z.boolean(),
  createdAt: z.string(),
  /** Versão do recurso; cresce a cada alteração (usada para ordenar eventos de tempo real). */
  version: z.number().int(),
})
export type NftSummary = z.infer<typeof NftSummary>

export const NftDetail = NftSummary.extend({
  description: z.string(),
  gallery: z.array(z.object({ src: z.string(), alt: z.string() })),
  editions: z.array(Edition),
  attributes: z.array(z.object({ trait: z.string(), value: z.string() })),
  contract: z.string(),
  tokenStandard: z.string(),
})
export type NftDetail = z.infer<typeof NftDetail>

export const NftListParams = z.object({
  q: z.string().optional(),
  category: z.array(Category).optional(),
  network: z.array(Network).optional(),
  minPrice: z.string().optional(),
  maxPrice: z.string().optional(),
  onlyAvailable: z.boolean().optional(),
  sort: SortOption.optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(48).optional(),
})
export type NftListParams = z.infer<typeof NftListParams>

export const Paginated = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  })

export const NftListResponse = Paginated(NftSummary).extend({
  /** Contagem por categoria/rede considerando os demais filtros (alimenta os números da barra lateral) */
  facets: z.object({
    category: z.record(z.string(), z.number().int()),
    network: z.record(z.string(), z.number().int()),
    priceRange: z.object({ min: EthAmount, max: EthAmount }),
  }),
})
export type NftListResponse = z.infer<typeof NftListResponse>

export const FeaturedResponse = z.object({ items: z.array(NftSummary) })

// ---------- Favoritos ----------

export const FavoritesResponse = z.object({ nftIds: z.array(z.string()) })
export type FavoritesResponse = z.infer<typeof FavoritesResponse>

// ---------- Carrinho e cotação ----------

export const CartItem = z.object({
  id: z.string(),
  nftId: z.string(),
  editionId: z.string(),
  name: z.string(),
  editionName: z.string(),
  image: z.string(),
  collection: z.string(),
  network: Network,
  quantity: z.number().int().positive(),
  /** Preço atual da edição (fonte da verdade é o catálogo) */
  unitPrice: EthAmount,
  /** Preço quando o item foi adicionado; diferente de unitPrice = preço mudou */
  priceWhenAdded: EthAmount,
  available: z.number().int().nonnegative(),
  maxPerOrder: z.number().int().positive(),
  lineTotal: EthAmount,
  issue: z.enum(['price_changed', 'insufficient_stock', 'sold_out']).nullable(),
})
export type CartItem = z.infer<typeof CartItem>

export const Coupon = z.object({
  code: z.string(),
  description: z.string(),
  /** Percentual de desconto, ex.: "10" */
  percentOff: z.string(),
})
export type Coupon = z.infer<typeof Coupon>

export const CartSummary = z.object({
  subtotal: EthAmount,
  discount: EthAmount,
  networkFee: EthAmount,
  total: EthAmount,
})
export type CartSummary = z.infer<typeof CartSummary>

export const Cart = z.object({
  id: z.string(),
  owner: z.enum(['guest', 'user']),
  items: z.array(CartItem),
  coupon: Coupon.nullable(),
  summary: CartSummary,
  version: z.number().int(),
  updatedAt: z.string(),
})
export type Cart = z.infer<typeof Cart>

export const AddToCartInput = z.object({
  nftId: z.string(),
  editionId: z.string(),
  quantity: z.number().int().positive(),
})
export type AddToCartInput = z.infer<typeof AddToCartInput>

export const QuoteInput = z.object({
  network: Network,
  couponCode: z.string().nullable(),
})
export type QuoteInput = z.infer<typeof QuoteInput>

export const QuoteLine = z.object({
  nftId: z.string(),
  editionId: z.string(),
  name: z.string(),
  editionName: z.string(),
  image: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: EthAmount,
  lineTotal: EthAmount,
})
export type QuoteLine = z.infer<typeof QuoteLine>

export const Quote = z.object({
  id: z.string(),
  network: Network,
  lines: z.array(QuoteLine),
  coupon: Coupon.nullable(),
  subtotal: EthAmount,
  discount: EthAmount,
  networkFee: EthAmount,
  total: EthAmount,
  /** Hash do conteúdo cotado; o pedido só é aceito se ainda bater com o estado do catálogo */
  fingerprint: z.string(),
  expiresAt: z.string(),
})
export type Quote = z.infer<typeof Quote>

// ---------- Carteiras ----------

export const WalletProvider = z.enum(['metamask', 'walletconnect', 'coinbase'])
export type WalletProvider = z.infer<typeof WalletProvider>

const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

export function isValidAddress(address: string, network: Network) {
  return network === 'solana' ? SOLANA_ADDRESS.test(address) : EVM_ADDRESS.test(address)
}

export const Wallet = z.object({
  id: z.string(),
  role: z.enum(['primary', 'secondary']),
  displayName: z.string(),
  nickname: z.string(),
  network: Network,
  profileName: z.string(),
  address: z.string(),
  secondaryAddress: z.string().nullable(),
  provider: WalletProvider,
  referralCode: z.string(),
  email: z.string(),
  ensName: z.string(),
  updatedAt: z.string(),
})
export type Wallet = z.infer<typeof Wallet>

export const WalletInput = z
  .object({
    role: z.enum(['primary', 'secondary']),
    displayName: z.string().trim().min(2, 'Informe o nome de exibição'),
    nickname: z.string().trim().min(2, 'Informe o apelido da carteira').max(30, 'Máximo de 30 caracteres'),
    network: Network,
    profileName: z.string().trim().min(2, 'Informe o nome do perfil'),
    address: z.string().trim().min(1, 'Informe o endereço da carteira'),
    secondaryAddress: z.string().trim().nullable(),
    provider: WalletProvider,
    referralCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9-]{4,16}$/, 'Código de indicação: 4 a 16 letras, números ou hífen'),
    email: z.string().trim().email('Informe um e-mail válido'),
    ensName: ensRule,
  })
  .superRefine((v, ctx) => {
    if (!isValidAddress(v.address, v.network)) {
      ctx.addIssue({
        code: 'custom',
        path: ['address'],
        message: v.network === 'solana' ? 'Endereço Solana inválido' : 'Endereço inválido: use 0x seguido de 40 caracteres hexadecimais',
      })
    }
    if (v.secondaryAddress && !v.secondaryAddress.endsWith('.eth') && !isValidAddress(v.secondaryAddress, v.network)) {
      ctx.addIssue({ code: 'custom', path: ['secondaryAddress'], message: 'Use um nome ENS (.eth) ou um endereço válido' })
    }
  })
export type WalletInput = z.infer<typeof WalletInput>

export const WalletConnection = z.object({
  walletId: z.string(),
  network: Network,
  status: z.literal('connected'),
  connectedAt: z.string(),
})
export type WalletConnection = z.infer<typeof WalletConnection>

// ---------- Pedidos ----------

export const OrderStatus = z.enum(['pending', 'confirmed', 'rejected'])
export type OrderStatus = z.infer<typeof OrderStatus>

/** "Perfil do colecionador" do checkout (pré-preenchido com a carteira escolhida) */
export const CollectorInput = z.object({
  displayName: z.string().trim().min(2, 'Informe o nome de exibição'),
  username: usernameRule,
  profileName: z.string().trim().min(2, 'Informe o nome do perfil'),
  email: z.string().trim().email('Informe um e-mail válido'),
  ensName: ensRule,
  referralCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{4,16}$/, 'Código de indicação: 4 a 16 letras, números ou hífen'),
  note: z.string().trim().max(280, 'Máximo de 280 caracteres'),
})
export type CollectorInput = z.infer<typeof CollectorInput>

export const CreateOrderInput = z.object({
  quoteId: z.string(),
  fingerprint: z.string(),
  walletId: z.string(),
  network: Network,
  provider: WalletProvider,
  collector: CollectorInput,
})
export type CreateOrderInput = z.infer<typeof CreateOrderInput>

export const Order = z.object({
  id: z.string(),
  number: z.string(),
  userId: z.string(),
  status: OrderStatus,
  /** Motivo quando recusado */
  failureReason: z.string().nullable(),
  network: Network,
  wallet: z.object({ id: z.string(), nickname: z.string(), address: z.string(), provider: WalletProvider }),
  collector: CollectorInput,
  /** Snapshot congelado no momento do pedido: mudanças no catálogo não alteram o recibo */
  lines: z.array(QuoteLine),
  coupon: Coupon.nullable(),
  subtotal: EthAmount,
  discount: EthAmount,
  networkFee: EthAmount,
  total: EthAmount,
  txHash: z.string().nullable(),
  explorerUrl: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int(),
})
export type Order = z.infer<typeof Order>

// ---------- Eventos de tempo real ----------

const EventBase = z.object({
  /** Identidade estável: o mesmo evento reenviado tem o mesmo id */
  eventId: z.string(),
  occurredAt: z.string(),
  /** Versão do recurso depois da alteração */
  version: z.number().int(),
})

export const NftUpdatedEvent = EventBase.extend({
  type: z.literal('nft.updated'),
  resource: z.object({ type: z.literal('nft'), id: z.string() }),
  data: z.object({
    price: EthAmount,
    available: z.number().int().nonnegative(),
    editions: z.array(Edition.pick({ id: true, price: true, available: true, status: true })),
  }),
})
export type NftUpdatedEvent = z.infer<typeof NftUpdatedEvent>

export const OrderUpdatedEvent = EventBase.extend({
  type: z.literal('order.updated'),
  resource: z.object({ type: z.literal('order'), id: z.string() }),
  /** Dono do pedido; o cliente descarta eventos de outro usuário */
  userId: z.string(),
  data: z.object({ status: OrderStatus, failureReason: z.string().nullable(), txHash: z.string().nullable() }),
})
export type OrderUpdatedEvent = z.infer<typeof OrderUpdatedEvent>

export type RealtimeEvent = NftUpdatedEvent | OrderUpdatedEvent

export const SOCKET_EVENTS = {
  nftUpdated: 'nft.updated',
  orderUpdated: 'order.updated',
} as const
