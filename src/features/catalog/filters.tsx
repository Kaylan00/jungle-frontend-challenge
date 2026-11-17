import { useEffect, useState } from 'react'
import type { Category, Network, NftListResponse } from '@/api/contracts'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import { CATEGORY_LABEL, NETWORK_LABEL, type CatalogSearch } from './search-params'

type Facets = NftListResponse['facets'] | undefined

const PRICE_MIN = 0
const PRICE_MAX = 12.3

/**
 * Filtros combináveis. Cada mudança vira um novo estado de URL com page=1
 * (mudar filtro reinicia a paginação).
 */
export function CatalogFilters({
  search,
  facets,
  onChange,
  idPrefix = 'f',
}: {
  search: CatalogSearch
  facets: Facets
  onChange: (patch: Partial<CatalogSearch>) => void
  idPrefix?: string
}) {
  const [range, setRange] = useState<[number, number]>([Number(search.minPrice ?? PRICE_MIN), Number(search.maxPrice ?? PRICE_MAX)])
  useEffect(() => {
    setRange([Number(search.minPrice ?? PRICE_MIN), Number(search.maxPrice ?? PRICE_MAX)])
  }, [search.minPrice, search.maxPrice])

  const toggle = <T extends string>(list: T[] | undefined, value: T) => {
    const set = new Set(list ?? [])
    if (set.has(value)) set.delete(value)
    else set.add(value)
    return set.size ? [...set] : undefined
  }

  return (
    <div className="space-y-7">
      <fieldset>
        <legend className="mb-3 text-[15px] font-bold">Coleções</legend>
        <ul className="space-y-1">
          {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => {
            const checked = Boolean(search.category?.includes(c))
            const id = `${idPrefix}-cat-${c}`
            return (
              <li key={c}>
                <label htmlFor={id} className={cn('flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] hover:bg-secondary', checked && 'text-primary')}>
                  <Checkbox id={id} checked={checked} onCheckedChange={() => onChange({ category: toggle(search.category, c) })} className="size-3.5" />
                  <span className="flex-1">{CATEGORY_LABEL[c]}</span>
                  <span className={cn('tabular-nums', checked ? 'text-primary' : 'text-muted-foreground')}>({facets?.category[c] ?? 0})</span>
                </label>
              </li>
            )
          })}
        </ul>
      </fieldset>

      <fieldset>
        <legend className="mb-3 text-[15px] font-bold">Faixa de preço</legend>
        <Slider
          min={PRICE_MIN}
          max={PRICE_MAX}
          step={0.01}
          value={range}
          onValueChange={(v) => setRange([v[0], v[1]])}
          aria-label="Faixa de preço em ETH"
          thumbLabels={['Preço mínimo', 'Preço máximo']}
          className="px-1"
        />
        <p className="mt-3 text-[13px] text-muted-foreground" aria-live="polite">
          Preço: {range[0].toFixed(2).replace('.', ',')} – {range[1].toFixed(2).replace('.', ',')} ETH
        </p>
        <Button
          size="sm"
          className="mt-3 h-7 px-3 text-[13px] font-bold"
          onClick={() =>
            onChange({
              minPrice: range[0] > PRICE_MIN ? String(range[0]) : undefined,
              maxPrice: range[1] < PRICE_MAX ? String(range[1]) : undefined,
            })
          }
        >
          Aplicar
        </Button>
      </fieldset>

      <fieldset>
        <legend className="mb-3 text-[15px] font-bold">Rede</legend>
        <ul className="space-y-1">
          {(Object.keys(NETWORK_LABEL) as Network[]).map((n) => {
            const checked = Boolean(search.network?.includes(n))
            const id = `${idPrefix}-net-${n}`
            return (
              <li key={n}>
                <label htmlFor={id} className={cn('flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] hover:bg-secondary', checked && 'text-primary')}>
                  <Checkbox id={id} checked={checked} onCheckedChange={() => onChange({ network: toggle(search.network, n) })} className="size-3.5" />
                  <span className="flex-1">{NETWORK_LABEL[n]}</span>
                  <span className={cn('tabular-nums', checked ? 'text-primary' : 'text-muted-foreground')}>({facets?.network[n] ?? 0})</span>
                </label>
              </li>
            )
          })}
        </ul>
      </fieldset>

      <label htmlFor={`${idPrefix}-available`} className="flex cursor-pointer items-center gap-2 px-2 text-[13px]">
        <Checkbox id={`${idPrefix}-available`} checked={Boolean(search.onlyAvailable)} onCheckedChange={(v) => onChange({ onlyAvailable: v === true ? true : undefined })} className="size-3.5" />
        Somente disponíveis
      </label>
    </div>
  )
}
