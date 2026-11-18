import { useEffect, useRef, useState } from 'react'
import type { Category, Network, NftListResponse } from '@/api/contracts'
import { Checkbox as CheckboxPrimitive } from 'radix-ui'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import { CATEGORY_LABEL, formatPrice, NETWORK_LABEL, type CatalogSearch } from './search-params'

type Facets = NftListResponse['facets'] | undefined
type Range = [number, number]

/** Faixa do Figma ("Preço: 0,00 - 12,30 ETH"). */
const PRICE_MIN = 0
const PRICE_MAX = 12.3

/**
 * Limites do slider e dos campos: a faixa do Figma, ampliada se a faixa de preços do catálogo
 * (facets.priceRange da API) sair dela. Assim todo preço existente é alcançável.
 */
function priceBounds(facets: Facets): Range {
  if (!facets) return [PRICE_MIN, PRICE_MAX]
  const min = Math.floor(Number(facets.priceRange.min) * 100) / 100
  const max = Math.ceil(Number(facets.priceRange.max) * 100) / 100
  return [Math.min(PRICE_MIN, min), Math.max(PRICE_MAX, max)]
}

/** Número com vírgula ou ponto e até 4 casas ("1,5", "0.25", "3", ",75"). */
const PRICE_INPUT = /^(\d+([.,]\d{0,4})?|[.,]\d{1,4})$/

type PriceField = 'min' | 'max'
type PriceError = { field: PriceField; message: string }
const FIELD_LABEL: Record<PriceField, string> = { min: 'Mín.', max: 'Máx.' }

/** Valida os dois campos. Campo vazio = sem limite daquele lado. */
function parsePriceRange(text: [string, string], bounds: Range, lastEdited: PriceField): { value: Range } | { error: PriceError } {
  const value: number[] = []
  for (const [i, field] of (['min', 'max'] as const).entries()) {
    const raw = text[i].trim()
    if (!raw) {
      value.push(bounds[i])
      continue
    }
    if (!PRICE_INPUT.test(raw)) return { error: { field, message: `${FIELD_LABEL[field]}: use só números, com até 4 casas decimais (ex.: 1,25).` } }
    const n = Number(raw.replace(',', '.'))
    if (n < bounds[0] || n > bounds[1])
      return { error: { field, message: `${FIELD_LABEL[field]}: informe um valor de ${formatPrice(bounds[0])} a ${formatPrice(bounds[1])} ETH.` } }
    value.push(n)
  }
  if (value[0] > value[1]) return { error: { field: lastEdited, message: 'O mínimo não pode ser maior que o máximo.' } }
  return { value: [value[0], value[1]] }
}

const clamp = (n: number, [lo, hi]: Range) => Math.min(hi, Math.max(lo, n))
const formatRange = (r: Range): [string, string] => [formatPrice(r[0]), formatPrice(r[1])]

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
  const bounds = priceBounds(facets)
  const [lo, hi] = bounds
  const applied = (): Range => [clamp(search.minPrice ?? lo, bounds), clamp(search.maxPrice ?? hi, bounds)]
  // Slider e campos são um rascunho: só viram filtro (URL) no "Aplicar" ou no Enter.
  const [range, setRange] = useState<Range>(applied)
  const [text, setText] = useState<[string, string]>(() => formatRange(applied()))
  const [error, setError] = useState<PriceError | null>(null)
  const lastEdited = useRef<PriceField>('min')
  const minInput = useRef<HTMLInputElement>(null)
  const maxInput = useRef<HTMLInputElement>(null)
  const errorId = `${idPrefix}-price-error`

  // A URL mudou por fora (etiqueta removida, voltar do navegador, "Limpar tudo"): o rascunho acompanha.
  useEffect(() => {
    const r = applied()
    setRange(r)
    setText(formatRange(r))
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.minPrice, search.maxPrice, lo, hi])

  const fromSlider = (v: number[]) => {
    const r: Range = [v[0], v[1]]
    setRange(r)
    setText(formatRange(r))
    setError(null)
  }

  const fromInput = (field: PriceField, raw: string) => {
    const i = field === 'min' ? 0 : 1
    const next: [string, string] = i === 0 ? [raw, text[1]] : [text[0], raw]
    setText(next)
    lastEdited.current = field
    // Valor válido move o polegar na hora (sem cruzar o outro polegar).
    const trimmed = raw.trim()
    const n = trimmed ? Number(trimmed.replace(',', '.')) : bounds[i]
    if ((!trimmed || PRICE_INPUT.test(trimmed)) && n >= lo && n <= hi && (i === 0 ? n <= range[1] : n >= range[0]))
      setRange(i === 0 ? [n, range[1]] : [range[0], n])
    // Com um erro na tela, revalida a cada tecla: o aviso some assim que o valor fica certo.
    if (error) {
      const result = parsePriceRange(next, bounds, field)
      setError('error' in result ? result.error : null)
    }
  }

  // Valor válido fica no formato da tela ("1.5" vira "1,50"; vazio vira o limite). Inválido fica como está:
  // o aviso só aparece no "Aplicar"/Enter. Mostrá-lo aqui empurraria o botão "Aplicar" para baixo entre o
  // mousedown (que tira o foco do campo) e o mouseup, e o clique se perderia.
  const onInputBlur = () => {
    const result = parsePriceRange(text, bounds, lastEdited.current)
    if (!('error' in result)) setText(formatRange(result.value))
  }

  const apply = () => {
    const result = parsePriceRange(text, bounds, lastEdited.current)
    if ('error' in result) {
      setError(result.error)
      ;(result.error.field === 'min' ? minInput : maxInput).current?.focus()
      return
    }
    const [min, max] = result.value
    setRange(result.value)
    setText(formatRange(result.value))
    setError(null)
    onChange({ minPrice: min > lo ? min : undefined, maxPrice: max < hi ? max : undefined })
  }

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

      {/* Formulário só para o Enter dos campos aplicar a faixa (mesmo efeito do botão "Aplicar"). */}
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          apply()
        }}
      >
        <fieldset className="mt-[37px]">
          <legend className={legend}>Faixa de preço</legend>
          <Slider
            min={lo}
            max={hi}
            step={0.01}
            value={range}
            onValueChange={fromSlider}
            // Enter num dos polegares aplica a faixa, como nos campos (o polegar não envia o formulário sozinho).
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              apply()
            }}
            aria-label="Faixa de preço em ETH"
            thumbLabels={['Preço mínimo', 'Preço máximo']}
            className="ml-[15px] mt-4 w-auto"
          />
          <p className="ml-3 mt-[19px] text-[15px] leading-6" aria-live="polite">
            Preço: {range[0].toFixed(2).replace('.', ',')} - {range[1].toFixed(2).replace('.', ',')} ETH
          </p>
          {/* Valor exato: dois campos ligados ao slider (mexer em um atualiza o outro). */}
          <div className="ml-3 mt-3 grid grid-cols-2 gap-2.5">
            {(['min', 'max'] as const).map((field, i) => (
              <div key={field} className="min-w-0">
                <label htmlFor={`${idPrefix}-price-${field}`} className="block text-[13px] leading-4 text-muted-foreground">
                  {FIELD_LABEL[field]}
                  <span className="sr-only"> (ETH)</span>
                </label>
                <div className="relative mt-1.5">
                  <input
                    ref={field === 'min' ? minInput : maxInput}
                    id={`${idPrefix}-price-${field}`}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    spellCheck={false}
                    value={text[i]}
                    onChange={(e) => fromInput(field, e.target.value)}
                    onBlur={onInputBlur}
                    aria-invalid={error?.field === field || undefined}
                    aria-describedby={error?.field === field ? errorId : undefined}
                    className="h-9 w-full min-w-0 rounded-[4px] border border-transparent bg-band pl-2.5 pr-9 text-base tabular-nums text-foreground transition-colors hover:border-[#3f2319] aria-[invalid=true]:border-destructive md:text-[14px]"
                    data-testid={`price-${field}`}
                  />
                  <span aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">
                    ETH
                  </span>
                </div>
              </div>
            ))}
          </div>
          {error && (
            <p id={errorId} className="ml-3 mt-2 flex gap-1 text-[12px] leading-4 text-destructive" data-testid="price-error">
              <span aria-hidden="true">⚠</span>
              {error.message}
            </p>
          )}
          <Button type="submit" className="ml-3 mt-3 h-9 w-[92px] rounded-[4px] text-base font-bold hover:bg-primary-hover">
            Aplicar
          </Button>
        </fieldset>
      </form>

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
