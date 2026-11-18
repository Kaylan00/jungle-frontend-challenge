/**
 * Usuários fictícios do cenário padrão (documentados no README).
 * As senhas aqui são só a entrada da seed: o "banco" simulado guarda apenas hash + salt.
 */
import type { CouponKind, UserRole, Wallet } from '@/api/contracts'

type SeedWallet = Omit<Wallet, 'updatedAt'>

/** Conta administradora da seed (painel em /admin). */
export const ADMIN_USER_ID = 'usr-admin'

export const SEED_USERS: Array<{
  id: string
  name: string
  username: string
  email: string
  password: string
  role: UserRole
  ensName: string
  walletNickname: string
  wallets: SeedWallet[]
  favorites: string[]
}> = [
  {
    id: ADMIN_USER_ID,
    name: 'Kurio Admin',
    username: 'kurio_admin',
    email: 'admin@kurio.test',
    password: 'Kurio#Admin2026',
    role: 'admin',
    ensName: 'kurio-admin',
    walletNickname: 'Operação',
    favorites: [],
    wallets: [],
  },
  {
    id: 'usr-ana',
    name: 'Ana Colecionadora',
    username: 'ana_nft',
    email: 'ana@kurio.test',
    password: 'Selva2026!',
    role: 'user',
    ensName: 'ana-kurio',
    walletNickname: 'Principal',
    favorites: ['nft-01', 'nft-10'],
    wallets: [
      {
        id: 'wal-ana-1',
        role: 'primary',
        displayName: 'Ana Colecionadora',
        nickname: 'Principal',
        network: 'ethereum',
        profileName: 'ana.kurio',
        address: '0xA91F2c4B8e1D7a3F5b6C9d0E1f2A3b4C5d6EE82C',
        secondaryAddress: null,
        provider: 'metamask',
        referralCode: 'KURIO-ANA',
        email: 'ana@kurio.test',
        ensName: 'ana-kurio',
      },
      {
        id: 'wal-ana-2',
        role: 'secondary',
        displayName: 'Ana Colecionadora',
        nickname: 'Reserva',
        network: 'polygon',
        profileName: 'nova.kurio',
        address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
        secondaryAddress: 'nova.kurio.eth',
        provider: 'coinbase',
        referralCode: 'KURIO-ANA',
        email: 'ana@kurio.test',
        ensName: 'nova-kurio',
      },
    ],
  },
  {
    id: 'usr-bruno',
    name: 'Bruno Pixel',
    username: 'bruno_pixel',
    email: 'bruno@kurio.test',
    password: 'Pixel2026!',
    role: 'user',
    ensName: 'bruno-pixel',
    walletNickname: 'Carteira de jogos',
    favorites: ['nft-05'],
    wallets: [],
  },
]

/** Cupons da seed. O painel admin cria outros (percentual ou valor fixo) e desativa qualquer um. */
export const COUPONS: Array<{ code: string; description: string; kind: CouponKind; value: string; expiresAt: string | null }> = [
  { code: 'KURIO10', description: 'Desconto de lançamento (10%)', kind: 'percent', value: '10', expiresAt: '2099-12-31T23:59:59.000Z' },
  { code: 'GENESIS25', description: 'Lançamento gênesis (25%)', kind: 'percent', value: '25', expiresAt: '2099-12-31T23:59:59.000Z' },
  { code: 'BLACK2025', description: 'Black Friday 2025', kind: 'percent', value: '30', expiresAt: '2025-11-30T23:59:59.000Z' },
]

/** Data de criação fixa dos cupons da seed (estável para os testes). */
export const SEED_DATE = '2026-01-10T12:00:00.000Z'

/** Taxa de rede estimada por rede (simulada), em ETH. */
export const NETWORK_FEES: Record<'ethereum' | 'polygon' | 'solana', string> = {
  ethereum: '0.016',
  polygon: '0.0004',
  solana: '0.0002',
}
