/**
 * Catálogo fixo (determinístico) do cenário padrão.
 *
 * Nomes, coleções, categorias, redes e edições seguem o Figma (Emerald Ape #042, Sage Nomad #009,
 * edições 1/1 · 1/10 · 1/50 · Aberta...). São 36 NFTs, o suficiente para exercitar busca,
 * filtros combinados e paginação (9 por página = 4 páginas, como no layout).
 * As 4 artes vêm do arquivo do Figma (public/nfts).
 */
import type { Category, Edition, Network, NftDetail } from '@/api/contracts'

type Art = 'emerald' | 'sage' | 'ivory' | 'golden'

const ART_ALT: Record<Art, string> = {
  emerald: 'Macaco marrom com óculos redondos verdes, jaqueta college verde e colar de esmeralda',
  sage: 'Gorila cinza de chapéu bucket verde-oliva e moletom lilás',
  ivory: 'Macaco de pelo escuro com blazer bege e gola alta verde',
  golden: 'Macaco dourado com fones de ouvido verdes e jaqueta creme',
}

const creators = [
  { id: 'cr-1', name: 'Nova Sato', avatarUrl: '/nfts/emerald.webp', verified: true },
  { id: 'cr-2', name: 'Theo Andrade', avatarUrl: '/nfts/ivory.webp', verified: true },
  { id: 'cr-3', name: 'Luna Ribeiro', avatarUrl: '/nfts/golden.webp', verified: false },
]

type EditionRow = [name: '1/1' | '1/10' | '1/50' | 'Aberta', price: string, available: number, maxPerOrder: number]

const SUPPLY: Record<EditionRow[0], number> = { '1/1': 1, '1/10': 10, '1/50': 50, Aberta: 500 }

const rows: Array<{
  name: string
  art: Art
  collection: string
  category: Category
  network: Network
  editions: EditionRow[]
  compareAt?: string
  badge?: 'raro' | 'novo'
  featured?: boolean
  likes: number
  rating: number
  reviews: number
  daysAgo: number
}> = [
  { name: 'Emerald Ape #042', art: 'emerald', collection: 'Kurio Apes', category: 'arte-digital', network: 'ethereum', editions: [['1/1', '4.80', 1, 1], ['1/10', '2.35', 4, 2], ['1/50', '1.19', 18, 10], ['Aberta', '0.42', 200, 20]], featured: true, likes: 842, rating: 4.8, reviews: 19, daysAgo: 1 },
  { name: 'Sage Nomad #009', art: 'sage', collection: 'Kurio Apes', category: 'arte-digital', network: 'ethereum', editions: [['1/10', '1.69', 6, 2], ['1/50', '0.95', 22, 10]], featured: true, likes: 615, rating: 4.6, reviews: 12, daysAgo: 2 },
  { name: 'Neon Vessel #552', art: 'ivory', collection: 'Neon Vessels', category: 'colecionaveis', network: 'ethereum', editions: [['1/10', '1.99', 3, 2]], compareAt: '2.29', badge: 'raro', featured: true, likes: 1290, rating: 4.9, reviews: 31, daysAgo: 3 },
  { name: 'Cosmic Bloom #118', art: 'sage', collection: 'Cosmic Garden', category: 'generativa', network: 'polygon', editions: [['1/50', '1.29', 30, 10], ['Aberta', '0.29', 300, 20]], likes: 210, rating: 4.4, reviews: 8, daysAgo: 4 },
  { name: 'Violet Nomad #314', art: 'sage', collection: 'Kurio Apes', category: 'arte-digital', network: 'ethereum', editions: [['1/1', '1.39', 1, 1], ['1/50', '0.69', 40, 10]], featured: true, likes: 377, rating: 4.7, reviews: 15, daysAgo: 5 },
  { name: 'Ivory Baron #088', art: 'ivory', collection: 'Kurio Apes', category: 'colecionaveis', network: 'ethereum', editions: [['1/10', '1.79', 9, 9], ['1/50', '0.89', 25, 10]], likes: 455, rating: 4.5, reviews: 10, daysAgo: 6 },
  { name: 'Golden Beat #207', art: 'golden', collection: 'Golden Frequencies', category: 'musica', network: 'polygon', editions: [['1/50', '0.99', 35, 10], ['Aberta', '0.19', 400, 20]], likes: 530, rating: 4.6, reviews: 22, daysAgo: 7 },
  { name: 'Golden Wave #301', art: 'golden', collection: 'Golden Frequencies', category: 'musica', network: 'solana', editions: [['1/10', '0.74', 0, 2]], likes: 98, rating: 4.1, reviews: 4, daysAgo: 8 },
  { name: 'Golden Signal #160', art: 'golden', collection: 'Golden Frequencies', category: 'musica', network: 'polygon', editions: [['1/50', '0.39', 44, 10]], likes: 188, rating: 4.3, reviews: 6, daysAgo: 9 },
  { name: 'Emerald Ape #017', art: 'emerald', collection: 'Kurio Apes', category: 'arte-digital', network: 'ethereum', editions: [['1/1', '5.75', 1, 1]], badge: 'raro', likes: 1530, rating: 5, reviews: 40, daysAgo: 10 },
  { name: 'Ivory Baron #021', art: 'ivory', collection: 'Kurio Apes', category: 'arte-3d', network: 'ethereum', editions: [['1/10', '3.60', 2, 1]], likes: 980, rating: 4.8, reviews: 27, daysAgo: 11 },
  { name: 'Sage Drifter #077', art: 'sage', collection: 'Cosmic Garden', category: 'fotografia', network: 'solana', editions: [['1/50', '0.52', 14, 5]], likes: 64, rating: 4.0, reviews: 3, daysAgo: 12 },
  { name: 'Golden Pulse #044', art: 'golden', collection: 'Golden Frequencies', category: 'jogos', network: 'solana', editions: [['Aberta', '0.08', 500, 20]], badge: 'novo', likes: 301, rating: 4.2, reviews: 9, daysAgo: 13 },
  { name: 'Neon Vessel #610', art: 'ivory', collection: 'Neon Vessels', category: 'arte-3d', network: 'polygon', editions: [['1/50', '0.64', 20, 5]], likes: 522, rating: 4.4, reviews: 11, daysAgo: 14 },
  { name: 'Emerald Guard #133', art: 'emerald', collection: 'Kurio Editions', category: 'assinaturas', network: 'ethereum', editions: [['Aberta', '0.15', 250, 5]], likes: 143, rating: 4.1, reviews: 5, daysAgo: 15 },
  { name: 'Sage Monk #250', art: 'sage', collection: 'Kurio Editions', category: 'utilidade', network: 'polygon', editions: [['1/10', '0.88', 0, 2], ['1/50', '0.41', 0, 5]], likes: 77, rating: 3.9, reviews: 2, daysAgo: 16 },
  { name: 'Ivory Duke #019', art: 'ivory', collection: 'Kurio Apes', category: 'colecionaveis', network: 'ethereum', editions: [['1/1', '6.20', 1, 1]], badge: 'raro', likes: 1102, rating: 4.9, reviews: 35, daysAgo: 17 },
  { name: 'Golden Echo #388', art: 'golden', collection: 'Golden Frequencies', category: 'musica', network: 'ethereum', editions: [['1/50', '0.36', 26, 10]], likes: 260, rating: 4.3, reviews: 7, daysAgo: 18 },
  { name: 'Emerald Scout #205', art: 'emerald', collection: 'Kurio Apes', category: 'arte-digital', network: 'polygon', editions: [['1/50', '0.27', 33, 10]], likes: 233, rating: 4.2, reviews: 6, daysAgo: 19 },
  { name: 'Sage Pilgrim #412', art: 'sage', collection: 'Cosmic Garden', category: 'generativa', network: 'solana', editions: [['Aberta', '0.12', 350, 20]], likes: 156, rating: 4.0, reviews: 4, daysAgo: 20 },
  { name: 'Ivory Count #333', art: 'ivory', collection: 'Neon Vessels', category: 'fotografia', network: 'ethereum', editions: [['1/10', '4.15', 1, 1]], likes: 870, rating: 4.7, reviews: 18, daysAgo: 21 },
  { name: 'Golden Groove #099', art: 'golden', collection: 'Golden Frequencies', category: 'musica', network: 'polygon', editions: [['1/50', '0.07', 45, 10]], likes: 112, rating: 4.1, reviews: 5, daysAgo: 22 },
  { name: 'Emerald Ape #101', art: 'emerald', collection: 'Kurio Apes', category: 'arte-digital', network: 'ethereum', editions: [['1/10', '3.85', 0, 1], ['1/50', '1.10', 9, 5]], compareAt: '1.35', likes: 1404, rating: 4.8, reviews: 29, daysAgo: 23 },
  { name: 'Sage Wanderer #156', art: 'sage', collection: 'Kurio Apes', category: 'jogos', network: 'polygon', editions: [['1/50', '0.58', 11, 5]], likes: 340, rating: 4.3, reviews: 8, daysAgo: 24 },
  { name: 'Ivory Regent #072', art: 'ivory', collection: 'Kurio Editions', category: 'utilidade', network: 'ethereum', editions: [['1/10', '1.45', 3, 2]], likes: 410, rating: 4.4, reviews: 9, daysAgo: 25 },
  { name: 'Golden Rhythm #275', art: 'golden', collection: 'Golden Frequencies', category: 'musica', network: 'solana', editions: [['1/50', '0.29', 16, 5]], likes: 198, rating: 4.2, reviews: 4, daysAgo: 26 },
  { name: 'Emerald Ranger #318', art: 'emerald', collection: 'Kurio Editions', category: 'arte-3d', network: 'polygon', editions: [['1/10', '0.88', 4, 2]], likes: 286, rating: 4.3, reviews: 7, daysAgo: 27 },
  { name: 'Sage Hermit #064', art: 'sage', collection: 'Cosmic Garden', category: 'fotografia', network: 'ethereum', editions: [['1/1', '2.75', 1, 1]], badge: 'raro', likes: 760, rating: 4.7, reviews: 14, daysAgo: 28 },
  { name: 'Ivory Marquis #145', art: 'ivory', collection: 'Neon Vessels', category: 'colecionaveis', network: 'solana', editions: [['1/50', '0.19', 30, 10]], likes: 121, rating: 4.0, reviews: 3, daysAgo: 29 },
  { name: 'Golden Tempo #188', art: 'golden', collection: 'Golden Frequencies', category: 'jogos', network: 'polygon', editions: [['Aberta', '0.11', 100, 20]], likes: 95, rating: 3.9, reviews: 2, daysAgo: 30 },
  { name: 'Emerald Sentinel #222', art: 'emerald', collection: 'Kurio Apes', category: 'arte-digital', network: 'ethereum', editions: [['1/10', '1.55', 0, 2]], likes: 433, rating: 4.5, reviews: 10, daysAgo: 31 },
  { name: 'Sage Oracle #390', art: 'sage', collection: 'Kurio Editions', category: 'assinaturas', network: 'solana', editions: [['1/50', '0.52', 7, 3]], likes: 177, rating: 4.1, reviews: 4, daysAgo: 32 },
  { name: 'Ivory Knight #256', art: 'ivory', collection: 'Kurio Apes', category: 'arte-3d', network: 'polygon', editions: [['Aberta', '0.06', 70, 10]], likes: 59, rating: 3.8, reviews: 2, daysAgo: 33 },
  { name: 'Golden Chorus #411', art: 'golden', collection: 'Golden Frequencies', category: 'musica', network: 'ethereum', editions: [['1/10', '2.30', 2, 1]], likes: 512, rating: 4.6, reviews: 12, daysAgo: 34 },
  { name: 'Emerald Keeper #057', art: 'emerald', collection: 'Kurio Editions', category: 'generativa', network: 'polygon', editions: [['1/50', '0.58', 11, 5]], likes: 238, rating: 4.2, reviews: 5, daysAgo: 35 },
  { name: 'Ivory Vessel #499', art: 'ivory', collection: 'Neon Vessels', category: 'colecionaveis', network: 'ethereum', editions: [['1/50', '0.99', 5, 2]], likes: 365, rating: 4.4, reviews: 8, daysAgo: 36 },
]

/** Datas fixas: as baselines de regressão visual não mudam com o relógio. */
const BASE_DATE = Date.UTC(2026, 10, 15, 12, 0, 0)

function editionStatus(available: number): Edition['status'] {
  return available > 0 ? 'on_sale' : 'sold_out'
}

const tokenOf = (name: string) => name.match(/#(\d+)/)?.[1] ?? '0000'

export function buildNftFixtures(): NftDetail[] {
  return rows.map((r, i) => {
    const id = `nft-${String(i + 1).padStart(2, '0')}`
    const editions: Edition[] = r.editions.map(([name, price, available, maxPerOrder], j) => ({
      id: `${id}-ed-${j + 1}`,
      name,
      price,
      available,
      supply: SUPPLY[name],
      maxPerOrder,
      status: editionStatus(available),
    }))
    // NFT #3 tem uma edição fora de venda: exercita "edição indisponível" no detalhe.
    if (i === 2) editions.push({ id: `${id}-ed-x`, name: '1/1', price: '12.30', available: 0, supply: 1, maxPerOrder: 1, status: 'unavailable' })
    const onSale = editions.filter((e) => e.status === 'on_sale')
    const pool = onSale.length ? onSale : editions
    const minPrice = pool.reduce((m, e) => (Number(e.price) < Number(m) ? e.price : m), pool[0].price)
    const token = tokenOf(r.name).padStart(4, '0')
    const img = `/nfts/${r.art}.webp`
    return {
      id,
      name: r.name,
      collection: r.collection,
      creator: creators[i % creators.length],
      image: img,
      category: r.category,
      network: r.network,
      price: minPrice,
      compareAtPrice: r.compareAt ?? null,
      tokenId: `#${token}`,
      badge: r.badge ?? null,
      rating: r.rating,
      reviewsCount: r.reviews,
      available: onSale.reduce((s, e) => s + e.available, 0),
      likes: r.likes,
      featured: Boolean(r.featured),
      createdAt: new Date(BASE_DATE - r.daysAgo * 86_400_000).toISOString(),
      version: 1,
      description: `${r.name} é uma obra digital finalizada à mão da coleção ${r.collection}. Cada atributo fica armazenado nos metadados do token e verificado na ${r.network === 'solana' ? 'Solana' : r.network === 'polygon' ? 'Polygon' : 'Ethereum'}. A obra explora identidade, movimento e luz em um mundo digital sem fronteiras.`,
      gallery: [0, 1, 2, 3].map((n) => ({ src: img, alt: n === 0 ? ART_ALT[r.art] : `${ART_ALT[r.art]} — detalhe ${n + 1}` })),
      editions,
      attributes: [
        { trait: 'Coleção', value: r.collection },
        { trait: 'Atributos', value: r.art === 'emerald' ? 'Óculos, Esmeralda, Raro' : r.art === 'sage' ? 'Chapéu, Moletom, Sereno' : r.art === 'ivory' ? 'Blazer, Gola alta, Elegante' : 'Fones, Jaqueta, Ritmo' },
        { trait: 'Royalties', value: '5% nas vendas secundárias' },
      ],
      contract: `0x7A42${(0x1000 + i * 977).toString(16).toUpperCase()}…19FB`,
      tokenStandard: 'ERC-721',
    }
  })
}

/** Quantidade de NFTs por categoria e por rede, usada nos contadores da barra de filtros. */
export const ART_FILES = Object.keys(ART_ALT)
