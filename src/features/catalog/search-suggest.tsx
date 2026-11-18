/**
 * Campo de busca com sugestões (combobox acessível, padrão WAI-ARIA 1.2 "list autocomplete").
 *
 * - Debounce de 250 ms e mínimo de 2 caracteres: digitar não dispara uma requisição por tecla.
 * - Sugestões vêm da API (GET /nfts?q=&pageSize=5) por TanStack Query: o termo faz parte da chave e o `signal`
 *   vai para o Axios, então a busca de um termo abandonado é cancelada e uma resposta atrasada nunca aparece
 *   no lugar da atual.
 * - Teclado: ↓/↑ percorrem as opções (o foco fica no campo, a opção ativa vai em aria-activedescendant),
 *   Enter abre a opção ativa (ou faz a busca normal, sem opção ativa), Esc fecha a lista (com a lista já
 *   fechada, chama `onEscape`), Tab sai e fecha.
 * - Carregando, vazio e erro (com "Tentar de novo") aparecem no próprio painel; a contagem é anunciada numa
 *   região aria-live.
 */
import { useQuery } from '@tanstack/react-query'
import { forwardRef, useEffect, useId, useState, type ReactNode } from 'react'
import type { NftSummary } from '@/api/contracts'
import { nftSuggestQuery } from '@/api/queries'
import { ART_SIZES, artSources } from '@/lib/art'
import { formatEth } from '@/lib/eth'
import { cn } from '@/lib/utils'

const SUGGEST_MIN_CHARS = 2
const DEBOUNCE_MS = 250

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

/** Destaca (sem diferenciar maiúsculas) o trecho que bate com o termo. */
function highlightMatch(text: string, term: string): ReactNode {
  const needle = term.trim().toLowerCase()
  if (!needle) return text
  const parts: ReactNode[] = []
  const lower = text.toLowerCase()
  let from = 0
  for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, from)) {
    if (at > from) parts.push(text.slice(from, at))
    parts.push(
      <mark key={at} className="bg-transparent font-bold text-highlight">
        {text.slice(at, at + needle.length)}
      </mark>,
    )
    from = at + needle.length
  }
  if (from < text.length) parts.push(text.slice(from))
  return parts
}

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onSubmit' | 'role'> & {
  value: string
  onValueChange: (value: string) => void
  /** Enter sem opção ativa */
  onSubmitTerm?: (term: string) => void
  /** Opção escolhida (Enter ou clique) */
  onPick: (nft: NftSummary) => void
  /** Esc com a lista fechada */
  onEscape?: () => void
  /** Classes do contêiner (posicionamento do painel) e do painel */
  className?: string
  inputClassName?: string
  panelClassName?: string
  /** Ícone ou elemento antes do campo (fica dentro do contêiner) */
  leading?: ReactNode
}

export const SearchSuggest = forwardRef<HTMLInputElement, Props>(function SearchSuggest(
  { value, onValueChange, onSubmitTerm, onPick, onEscape, className, inputClassName, panelClassName, leading, id: idProp, onFocus, onBlur, onKeyDown, ...inputProps },
  ref,
) {
  const autoId = useId()
  const id = idProp ?? `suggest-${autoId}`
  const listId = `${id}-listbox`
  const optionId = (i: number) => `${id}-option-${i}`
  const [open, setOpen] = useState(false)
  // Opção ativa presa à lista em que foi escolhida (termo + resposta): lista nova = nenhuma opção ativa até a
  // pessoa usar as setas. Derivado no render, sem efeito para "zerar" depois.
  const [cursor, setCursor] = useState<{ term: string; data: unknown; index: number }>({ term: '', data: undefined, index: -1 })

  const term = value.trim()
  const debounced = useDebounced(term, DEBOUNCE_MS)
  const enabled = open && debounced.length >= SUGGEST_MIN_CHARS
  const suggest = useQuery({ ...nftSuggestQuery(debounced), enabled })
  const settled = debounced === term && !suggest.isPending
  const options = settled ? (suggest.data?.items ?? []) : []
  const showPanel = open && term.length >= SUGGEST_MIN_CHARS
  const showList = showPanel && options.length > 0

  const active = cursor.term === debounced && cursor.data === suggest.data ? cursor.index : -1
  const setActive = (index: number) => setCursor({ term: debounced, data: suggest.data, index })

  const status = !showPanel
    ? ''
    : !settled
      ? 'Buscando sugestões…'
      : suggest.isError
        ? 'Não foi possível carregar as sugestões.'
        : options.length === 0
          ? `Nenhum NFT encontrado para “${term}”.`
          : `${options.length} ${options.length === 1 ? 'sugestão' : 'sugestões'}. Use as setas para escolher.`

  const pick = (nft: NftSummary) => {
    setOpen(false)
    setActive(-1)
    onPick(nft)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e)
    if (e.defaultPrevented) return
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        e.preventDefault()
        if (!open) {
          setOpen(true)
          return
        }
        if (!options.length) return
        const step = e.key === 'ArrowDown' ? 1 : -1
        setActive(active === -1 ? (step === 1 ? 0 : options.length - 1) : (active + step + options.length) % options.length)
        return
      }
      case 'Enter':
        if (showList && active >= 0 && options[active]) {
          e.preventDefault()
          pick(options[active])
          return
        }
        if (onSubmitTerm) {
          e.preventDefault()
          setOpen(false)
          onSubmitTerm(term)
        }
        return
      case 'Escape':
        if (showPanel) {
          e.preventDefault()
          e.stopPropagation()
          setOpen(false)
          setActive(-1)
          return
        }
        onEscape?.()
        return
      case 'Tab':
        setOpen(false)
        return
    }
  }

  return (
    <div className={cn('relative', className)}>
      {leading}
      <input
        ref={ref}
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && active >= 0 ? optionId(active) : undefined}
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => {
          onValueChange(e.target.value)
          setOpen(true)
        }}
        onFocus={(e) => {
          setOpen(true)
          onFocus?.(e)
        }}
        onBlur={(e) => {
          setOpen(false)
          onBlur?.(e)
        }}
        onKeyDown={handleKeyDown}
        className={inputClassName}
        {...inputProps}
      />
      {showPanel && (
        <div
          className={cn(
            'absolute left-0 top-[calc(100%+6px)] z-50 w-full overflow-hidden rounded-md border border-border bg-card text-left shadow-2xl',
            panelClassName,
          )}
          data-slot="suggest-panel"
          data-testid="search-suggestions"
          aria-busy={!settled || undefined}
          // Clicar no painel não tira o foco do campo (senão o blur fecharia antes do clique).
          onMouseDown={(e) => e.preventDefault()}
        >
          {showList ? (
            <ul id={listId} role="listbox" aria-label="Sugestões de NFTs" className="max-h-[min(60vh,360px)] overflow-y-auto py-1">
              {options.map((nft, i) => (
                <li
                  key={nft.id}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === active}
                  onMouseMove={() => setActive(i)}
                  onClick={() => pick(nft)}
                  className={cn('flex cursor-pointer items-center gap-3 px-3 py-2 text-[14px] transition-colors', i === active && 'bg-secondary')}
                >
                  <img {...artSources(nft.image, ART_SIZES.detailThumb)} alt="" width={36} height={36} loading="lazy" className="size-9 shrink-0 rounded-[6px] object-cover" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate leading-5">{highlightMatch(nft.name, term)}</span>
                    <span className="block truncate text-[12px] leading-4 text-muted-foreground">{highlightMatch(nft.collection, term)}</span>
                  </span>
                  <span className="shrink-0 text-[13px] font-bold text-highlight">{formatEth(nft.price, { maxDecimals: 4 })}</span>
                </li>
              ))}
            </ul>
          ) : (
            // Sem opções: o painel mostra o estado (o listbox só existe com opções).
            <div id={listId} className="flex items-center justify-between gap-3 px-3 py-3 text-[13px] text-muted-foreground" data-testid="search-suggestions-status">
              <span>{status}</span>
              {settled && suggest.isError && (
                <button type="button" className="shrink-0 font-semibold text-highlight underline-offset-4 hover:underline" onClick={() => void suggest.refetch()}>
                  Tentar de novo
                </button>
              )}
            </div>
          )}
        </div>
      )}
      <span role="status" aria-live="polite" className="sr-only">
        {settled ? status : ''}
      </span>
    </div>
  )
})
