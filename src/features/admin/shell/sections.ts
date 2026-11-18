/**
 * As áreas do Kurio Admin: uma lista só, lida pelo trilho, pelo menu do celular e pela busca global. Um item
 * novo aparece nos três lugares de uma vez.
 */
import { Gem, LayoutDashboard, ReceiptText, TicketPercent, UsersRound, type LucideIcon } from 'lucide-react'
import { isInternalPath } from '@/features/auth/auth-search'

export type PanelPath = '/admin' | '/admin/nfts' | '/admin/cupons' | '/admin/pedidos' | '/admin/usuarios'

export interface PanelSection {
  to: PanelPath
  label: string
  /** Frase curta da linha na busca global. */
  description: string
  /** Sobretítulo e frase do cabeçalho da seção (também usados pelo skeleton enquanto o acesso é conferido). */
  eyebrow: string
  intro: string
  icon: LucideIcon
  /** Palavras que também levam a esta área na busca global. */
  keywords: string
}

export const PANEL_SECTIONS: PanelSection[] = [
  {
    to: '/admin',
    label: 'Visão geral',
    description: 'Números da loja e o que acabou de acontecer',
    eyebrow: 'Painel',
    intro: 'Os números da loja agora e o que acabou de acontecer. Tudo se atualiza sozinho pelo socket.',
    icon: LayoutDashboard,
    keywords: 'inicio início resumo indicadores dashboard receita eventos atividade',
  },
  {
    to: '/admin/nfts',
    label: 'NFTs',
    description: 'Preço, estoque, status das edições e destaque na vitrine',
    eyebrow: 'Catálogo',
    intro: 'Preço, estoque e status de cada edição, e o destaque na vitrine. Cada mudança chega ao vivo a quem está navegando ou comprando, inclusive em outras abas.',
    icon: Gem,
    keywords: 'catalogo catálogo edicoes edições preco preço estoque destaque vitrine',
  },
  {
    to: '/admin/cupons',
    label: 'Cupons',
    description: 'Criar, acompanhar e desativar descontos',
    eyebrow: 'Vendas',
    // Com a lista carregada a frase ganha a contagem (ver CouponsSection); esta é a forma longa, usada no skeleton.
    intro: '0 cupons ativos. Valem no carrinho e no pagamento assim que são criados; desativar tira o desconto de quem já aplicou.',
    icon: TicketPercent,
    keywords: 'desconto promocao promoção codigo código',
  },
  {
    to: '/admin/pedidos',
    label: 'Pedidos',
    description: 'Pedidos de todas as contas, com o status ao vivo',
    eyebrow: 'Vendas',
    intro: 'Pedidos de todas as contas, do mais recente ao mais antigo. O status muda aqui sozinho quando o pagamento é confirmado ou recusado.',
    icon: ReceiptText,
    keywords: 'compras vendas pagamentos pendentes confirmados recusados',
  },
  {
    to: '/admin/usuarios',
    label: 'Usuários',
    description: 'Contas da loja (somente leitura)',
    eyebrow: 'Pessoas',
    intro: 'Contas da loja, para dar contexto aos pedidos. Somente leitura: sem senha, carteiras nem e-mail completo.',
    icon: UsersRound,
    keywords: 'contas clientes colecionadores equipe',
  },
]

/** Cabeçalho de uma seção (sobretítulo, título e frase). */
export const sectionMeta = (to: PanelPath): PanelSection => PANEL_SECTIONS.find((s) => s.to === to)!

export function sectionFor(pathname: string): PanelSection {
  const clean = pathname.replace(/\/$/, '') || '/admin'
  return PANEL_SECTIONS.find((s) => s.to !== '/admin' && clean.startsWith(s.to)) ?? PANEL_SECTIONS[0]
}

/** Endereço de volta depois do login do painel: só caminhos do próprio painel (nunca outro site). */
export function safePanelRedirect(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2048 || !isInternalPath(value)) return undefined
  if (!/^\/admin(?:[/?#]|$)/.test(value) || value.startsWith('/admin/entrar')) return undefined
  return value
}
