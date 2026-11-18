import { describe, expect, it } from 'vitest'
import { activeFilters, catalogSearchSchema, toListParams, validateCatalogSearch } from './search-params'

describe('validateCatalogSearch', () => {
  it('dá o mesmo resultado do schema e corrige valores inválidos', () => {
    const input = { q: '  ape ', category: 'arte-3d', minPrice: '0.5', page: 0, sort: 'nada' }
    expect(validateCatalogSearch(input)).toEqual(catalogSearchSchema.parse(input))
    expect(validateCatalogSearch(input)).toEqual({ q: 'ape', category: ['arte-3d'], minPrice: 0.5 })
  })

  it('devolve o mesmo objeto para a mesma entrada (cache) e outro para entrada diferente', () => {
    const a = validateCatalogSearch({ network: ['polygon'], page: 2 })
    expect(validateCatalogSearch({ network: ['polygon'], page: 2 })).toBe(a)
    expect(validateCatalogSearch({ network: ['polygon'], page: 3 })).not.toBe(a)
  })

  it('o resultado alimenta os parâmetros da lista e as etiquetas de filtro', () => {
    const s = validateCatalogSearch({ network: ['solana', 'ethereum'], onlyAvailable: true })
    expect(toListParams(s)).toMatchObject({ network: ['ethereum', 'solana'], onlyAvailable: true, page: 1 })
    expect(activeFilters(s).map((f) => f.key)).toEqual(['network-solana', 'network-ethereum', 'available'])
  })
})
