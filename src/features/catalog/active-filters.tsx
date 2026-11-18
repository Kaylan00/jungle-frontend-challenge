import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { announce } from '@/lib/announcer'
import { cn } from '@/lib/utils'
import { activeFilters, type ActiveFilter, type CatalogSearch } from './search-params'

/**
 * Etiquetas dos filtros aplicados, logo acima da grade. Saem direto da URL (sem esperar a API):
 * quem abre um link filtrado já recebe a linha pronta, e sem filtro nada é renderizado (sem CLS).
 * Desktop: as etiquetas quebram linha e "Limpar tudo" fica à direita, como o "Ordenar por" acima.
 * Mobile: uma linha só, com rolagem lateral; "Limpar tudo" fica fixo ao lado.
 * Remover uma etiqueta leva o foco para a etiqueta seguinte (ou para a aba ativa, se não sobrar
 * nenhuma) e avisa o leitor de tela pela região aria-live do layout.
 */
export function ActiveFilters({
  search,
  onRemove,
  onClear,
  focusFallback,
  className,
}: {
  search: CatalogSearch
  onRemove: (filter: ActiveFilter) => void
  onClear: () => void
  /** Para onde o foco vai quando a última etiqueta some. */
  focusFallback: () => void
  className?: string
}) {
  const filters = activeFilters(search)
  const listRef = useRef<HTMLUListElement>(null)
  /** Posição da etiqueta removida pelo teclado/mouse: o foco vai para quem ocupar esse lugar. */
  const pendingFocus = useRef<number | null>(null)
  const keys = filters.map((f) => f.key).join('|')

  useEffect(() => {
    const index = pendingFocus.current
    if (index === null) return
    pendingFocus.current = null
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('button')
    if (buttons?.length) buttons[Math.min(index, buttons.length - 1)].focus()
    else focusFallback()
    // Só reage quando o conjunto de filtros muda (a URL já foi atualizada).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys])

  if (!filters.length) return null

  return (
    <div className={cn('flex items-start gap-3', className)} data-testid="active-filters">
      {/* Mobile: a lista rola de lado (sem barra visível) e esmaece na borda direita para indicar que continua.
          O respiro no fim da lista é do tamanho do esmaecido: se tudo couber, nenhuma etiqueta fica apagada. */}
      <div className="-my-1 min-w-0 flex-1 py-1 max-md:-ml-1 max-md:overflow-x-auto max-md:pl-1 max-md:[mask-image:linear-gradient(to_right,#000_calc(100%-32px),transparent)] max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden">
        <ul ref={listRef} aria-label="Filtros ativos" className="flex gap-2 max-md:w-max max-md:pr-8 md:flex-wrap">
          {filters.map((f, i) => (
            <li key={f.key} className="flex min-w-0 shrink-0">
              <button
                type="button"
                aria-label={`Remover filtro ${f.label}`}
                onClick={() => {
                  pendingFocus.current = i
                  announce(`Filtro ${f.label} removido.`)
                  onRemove(f)
                }}
                className="group inline-flex h-8 max-w-[260px] items-center gap-1.5 rounded-full border border-[#3f2319] pl-3 pr-2 text-[13px] leading-none text-foreground transition-[color,background-color,border-color] duration-200 hover:border-primary hover:bg-primary/15 hover:text-highlight md:text-[14px]"
              >
                <span className="truncate">{f.label}</span>
                <X className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-highlight" strokeWidth={2} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        onClick={() => {
          pendingFocus.current = 0
          announce('Todos os filtros foram removidos.')
          onClear()
        }}
        className="h-8 shrink-0 whitespace-nowrap px-1 text-[13px] text-highlight underline-offset-4 hover:underline md:text-[14px]"
      >
        Limpar tudo
      </button>
    </div>
  )
}
