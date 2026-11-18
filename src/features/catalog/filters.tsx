import { useEffect, useState } from 'react'
import type { Category, Network, NftListResponse } from '@/api/contracts'
import { Checkbox as CheckboxPrimitive } from 'radix-ui'
import { Button } from '@/components/ui/button'
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
    <div>
      <fieldset>
        <legend className={legend}>Coleções</legend>
        <ul className="mt-2">
          {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => (
            <li key={c}>
              <FilterRow
                id={`${idPrefix}-cat-${c}`}
                checked={Boolean(search.category?.includes(c))}
                onToggle={() => onChange({ category: toggle(search.category, c) })}
                label={CATEGORY_LABEL[c]}
                count={facets?.category[c] ?? 0}
                className="pr-3"
              />
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset className="mt-[37px]">
        <legend className={legend}>Faixa de preço</legend>
        <Slider
          min={PRICE_MIN}
          max={PRICE_MAX}
          step={0.01}
          value={range}
          onValueChange={(v) => setRange([v[0], v[1]])}
          aria-label="Faixa de preço em ETH"
          thumbLabels={['Preço mínimo', 'Preço máximo']}
          className="ml-[15px] mt-4 w-auto"
        />
        <p className="ml-3 mt-[19px] text-[15px] leading-6" aria-live="polite">
          Preço: {range[0].toFixed(2).replace('.', ',')} - {range[1].toFixed(2).replace('.', ',')} ETH
        </p>
        <Button
          className="ml-3 mt-2.5 h-9 w-[92px] rounded-[4px] text-base font-bold hover:bg-primary-hover"
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

      <fieldset className="mt-9">
        <legend className={legend}>Rede</legend>
        <ul className="mt-2">
          {(Object.keys(NETWORK_LABEL) as Network[]).map((n) => (
            <li key={n}>
              <FilterRow
                id={`${idPrefix}-net-${n}`}
                checked={Boolean(search.network?.includes(n))}
                onToggle={() => onChange({ network: toggle(search.network, n) })}
                label={NETWORK_LABEL[n]}
                count={facets?.network[n] ?? 0}
                className="pr-0"
              />
            </li>
          ))}
        </ul>
      </fieldset>

      {/* Não existe no Figma: filtro extra do desafio, no fim da caixa para não mexer no resto. */}
      <FilterRow
        id={`${idPrefix}-available`}
        checked={Boolean(search.onlyAvailable)}
        onToggle={() => onChange({ onlyAvailable: search.onlyAvailable ? undefined : true })}
        label="Somente disponíveis"
        className="pr-0.5"
      />
    </div>
  )
}

const legend = 'text-lg font-bold leading-6'

/**
 * Linha de filtro do Figma: só texto, sem caixinha; marcada fica laranja.
 * Continua sendo um checkbox de verdade (role="checkbox", Espaço alterna, nome = rótulo + contagem).
 */
function FilterRow({
  id,
  checked,
  onToggle,
  label,
  count,
  className,
}: {
  id: string
  checked: boolean
  onToggle: () => void
  label: string
  count?: number
  className?: string
}) {
  return (
    <CheckboxPrimitive.Root
      id={id}
      checked={checked}
      onCheckedChange={onToggle}
      className={cn(
        'flex h-10 w-full cursor-pointer items-center justify-between rounded-[4px] pl-3 text-left text-[15px] text-muted-foreground transition-[color,background-color,scale] duration-200 hover:bg-primary/10 hover:text-foreground active:scale-[0.98] data-[state=checked]:text-highlight',
        className,
      )}
    >
      <span>{label}</span>
      {count !== undefined && <span className="tabular-nums">({count})</span>}
    </CheckboxPrimitive.Root>
  )
}
