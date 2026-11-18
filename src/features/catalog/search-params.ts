/**
 * Estado do catálogo na URL (busca, filtros, ordenação e página).
 * A URL é a fonte da verdade: refresh, link compartilhado e voltar/avançar do navegador
 * restauram exatamente a mesma consulta. Valores inválidos na URL viram o padrão (.catch).
 */
import { z } from 'zod'
import { Category, Network, SortOption, type NftListParams } from '@/api/contracts'
import { toEthString } from '@/lib/eth'

export const PAGE_SIZE = 9

const csv = <T extends z.ZodTypeAny>(item: T) =>
  z
    .union([z.array(item), item.transform((v) => [v])])
    .optional()
    .catch(undefined)

/**
 * Preço em ETH na URL como número simples (`minPrice=0.5`): é o que o roteador grava para valores numéricos.
 * Também aceita o formato antigo, string entre aspas (`minPrice="0.5"`), para links já compartilhados.
 */
const price = z
  .union([z.number(), z.string().regex(/^\d+(\.\d+)?$/).transform(Number)])
  .refine((n) => Number.isFinite(n) && n >= 0)
  .optional()
  .catch(undefined)

export const catalogSearchSchema = z.object({
  q: z.string().trim().max(60).optional().catch(undefined),
  category: csv(Category),
  network: csv(Network),
  minPrice: price,
  maxPrice: price,
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
    minPrice: s.minPrice === undefined ? undefined : toEthString(s.minPrice),
    maxPrice: s.maxPrice === undefined ? undefined : toEthString(s.maxPrice),
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

/** Preço para exibir e digitar: vírgula decimal, de 2 a 4 casas (ex.: 0,50 · 1,2345). */
export function formatPrice(value: number) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4, useGrouping: false })
}

/** Patch que remove todos os filtros (busca inclusive) e mantém a ordenação. */
export const CLEAR_FILTERS: Partial<CatalogSearch> = {
  q: undefined,
  category: undefined,
  network: undefined,
  minPrice: undefined,
  maxPrice: undefined,
  onlyAvailable: undefined,
}

export type ActiveFilter = {
  key: string
  /** Texto da etiqueta; o botão se chama "Remover filtro <label>". */
  label: string
  /** O que muda na URL para tirar só este filtro. */
  patch: Partial<CatalogSearch>
}

/**
 * Filtros aplicados, na ordem da caixa de filtros (a busca primeiro). Alimenta as etiquetas acima
 * da grade e o contador do botão de filtros do mobile: os dois sempre batem.
 */
export function activeFilters(s: CatalogSearch): ActiveFilter[] {
  const list: ActiveFilter[] = []
  if (s.q) list.push({ key: 'q', label: `Busca: “${s.q}”`, patch: { q: undefined } })
  for (const c of new Set(s.category)) {
    const rest = s.category?.filter((v) => v !== c)
    list.push({ key: `category-${c}`, label: CATEGORY_LABEL[c], patch: { category: rest?.length ? rest : undefined } })
  }
  if (s.minPrice !== undefined || s.maxPrice !== undefined) {
    const label =
      s.minPrice !== undefined && s.maxPrice !== undefined
        ? `${formatPrice(s.minPrice)} – ${formatPrice(s.maxPrice)} ETH`
        : s.minPrice !== undefined
          ? `a partir de ${formatPrice(s.minPrice)} ETH`
          : `até ${formatPrice(s.maxPrice!)} ETH`
    list.push({ key: 'price', label: `Preço: ${label}`, patch: { minPrice: undefined, maxPrice: undefined } })
  }
  for (const n of new Set(s.network)) {
    const rest = s.network?.filter((v) => v !== n)
    list.push({ key: `network-${n}`, label: NETWORK_LABEL[n], patch: { network: rest?.length ? rest : undefined } })
  }
  if (s.onlyAvailable) list.push({ key: 'available', label: 'Somente disponíveis', patch: { onlyAvailable: undefined } })
  return list
}
