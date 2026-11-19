/** Seções do menu "Meu perfil" fora do escopo do desafio: abrem a tela "Em breve" em /perfil/<seção>. */
export const SOON_SECTIONS = {
  ofertas: { label: 'Ofertas', text: 'As ofertas que você fizer e receber pelos NFTs vão aparecer aqui.' },
  'arquivos-baixados': { label: 'Arquivos baixados', text: 'Os arquivos em alta resolução e os conteúdos desbloqueáveis dos seus NFTs vão ficar aqui.' },
  suporte: { label: 'Suporte', text: 'A central de atendimento para dúvidas sobre pedidos, carteiras e NFTs vai ficar aqui.' },
} as const

export type SoonSection = keyof typeof SOON_SECTIONS

export const isSoonSection = (value: string): value is SoonSection => Object.hasOwn(SOON_SECTIONS, value)
