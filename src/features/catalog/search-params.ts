/**
 * Estado do catálogo na URL (busca, filtros, ordenação e página).
 * A URL é a fonte da verdade: refresh, link compartilhado e voltar/avançar do navegador
 * restauram exatamente a mesma consulta. Valores inválidos na URL viram o padrão (.catch).
 */
import { z } from 'zod'
import { Category, Network, SortOption, type NftListParams } from '@/api/contracts'

export const PAGE_SIZE = 9

const csv = <T extends z.ZodTypeAny>(item: T) =>
  z
    .union([z.array(item), item.transform((v) => [v])])
    .optional()
    .catch(undefined)

export const catalogSearchSchema = z.object({
  q: z.string().trim().max(60).optional().catch(undefined),
  category: csv(Category),
  network: csv(Network),
  minPrice: z.string().regex(/^\d+(\.\d+)?$/).optional().catch(undefined),
  maxPrice: z.string().regex(/^\d+(\.\d+)?$/).optional().catch(undefined),
  onlyAvailable: z.boolean().optional().catch(undefined),
  sort: SortOption.optional().catch(undefined),
  page: z.number().int().min(1).optional().catch(undefined),
})
export type CatalogSearch = z.infer<typeof catalogSearchSchema>

export function toListParams(s: CatalogSearch): NftListParams {
  return {
    q: s.q || undefined,
    category: s.category?.length ? [...s.category].sort() : undefined,
    network: s.network?.length ? [...s.network].sort() : undefined,
    minPrice: s.minPrice,
    maxPrice: s.maxPrice,
    onlyAvailable: s.onlyAvailable || undefined,
    sort: s.sort,
    page: s.page ?? 1,
    pageSize: PAGE_SIZE,
  }
}

export const CATEGORY_LABEL: Record<Category, string> = {
  'arte-digital': 'Arte digital',
  fotografia: 'Fotografia',
  musica: 'Música',
  'arte-3d': 'Arte 3D',
  colecionaveis: 'Colecionáveis',
  generativa: 'Generativa',
  jogos: 'Jogos',
  assinaturas: 'Assinaturas',
  utilidade: 'Utilidade',
}

export const NETWORK_LABEL: Record<Network, string> = {
  ethereum: 'Ethereum',
  polygon: 'Polygon',
  solana: 'Solana',
}

export const SORT_LABEL: Record<SortOption, string> = {
  relevance: 'Relevância',
  recent: 'Listados recentemente',
  price_asc: 'Menor preço',
  price_desc: 'Maior preço',
  popular: 'Mais populares',
}
