/**
 * BUSCA GLOBAL do painel (Ctrl+K ou Ctrl+F, ou o botão do trilho/cabeçalho).
 *
 * Um modal, e não um campo fixo: aparece quando se pede e some quando se escolhe. Leva a qualquer área e
 * também a um NFT ou cupom pelo nome. As áreas respondem na hora (já estão na memória); os NFTs vêm da API
 * (/admin/nfts?q=, a partir de 2 letras e depois de uma pausa na digitação); os cupons vêm da lista do painel.
 *
 * Teclado: setas andam pela lista inteira (áreas, NFTs e cupons na ordem da tela), Enter abre, Esc fecha.
 * Padrão combobox + listbox com aria-activedescendant: o foco fica no campo o tempo todo (preso no diálogo).
 */
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { CornerDownLeft, ExternalLink, Gem, Search, TicketPercent, type LucideIcon } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { adminCouponsQuery, adminSearchNftsQuery } from '@/api/queries'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useSession } from '@/features/auth/use-session'
import { formatEth } from '@/lib/eth'
import { cn } from '@/lib/utils'
import { PANEL_SECTIONS } from './sections'

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

interface Result {
  id: string
  group: 'Áreas' | 'NFTs' | 'Cupons'
  label: string
  hint: string
  icon: LucideIcon
  run: () => void
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <PaletteBody close={() => onOpenChange(false)} />}
    </Dialog>
  )
}

function PaletteBody({ close }: { close: () => void }) {
  const navigate = useNavigate()
  const { owner } = useSession()
  const [term, setTerm] = useState('')
  const [debounced, setDebounced] = useState('')
  const [active, setActive] = useState(0)
  const listId = useId()
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 200)
    return () => clearTimeout(t)
  }, [term])

  const q = fold(term.trim())
  const nfts = useQuery({ ...adminSearchNftsQuery(owner, debounced), enabled: debounced.length >= 2 })
  const coupons = useQuery(adminCouponsQuery(owner))

  const results = useMemo<Result[]>(() => {
    const go = (fn: () => void) => () => {
      close()
      fn()
    }
    const areas: Result[] = PANEL_SECTIONS.filter((s) => !q || fold(`${s.label} ${s.keywords} ${s.description}`).includes(q)).map((s) => ({
      id: `area:${s.to}`,
      group: 'Áreas',
      label: s.label,
      hint: s.description,
      icon: s.icon,
      run: go(() => void navigate({ to: s.to })),
    }))
    if (!q || fold('ver loja vitrine site').includes(q)) {
      areas.push({ id: 'area:loja', group: 'Áreas', label: 'Ver loja', hint: 'Abre a vitrine numa nova aba', icon: ExternalLink, run: go(() => window.open('/', '_blank', 'noopener')) })
    }
    // Resultado de um termo que já não é o digitado não aparece (a consulta do termo atual ainda vem).
    const nftItems: Result[] =
      q.length >= 2 && fold(debounced) === q
        ? (nfts.data?.items ?? []).map((n) => ({
            id: `nft:${n.id}`,
            group: 'NFTs',
            label: n.name,
            hint: `${n.collection} · ${formatEth(n.price)} · ${n.id}`,
            icon: Gem,
            run: go(() => void navigate({ to: '/admin/nfts', search: { q: n.id, abrir: n.id } })),
          }))
        : []
    const couponItems: Result[] = q
      ? (coupons.data?.items ?? [])
          .filter((c) => fold(`${c.code} ${c.description}`).includes(q))
          .slice(0, 5)
          .map((c) => ({
            id: `cupom:${c.code}`,
            group: 'Cupons',
            label: c.code,
            hint: `${c.description} · ${c.status === 'active' ? 'ativo' : c.status === 'expired' ? 'expirado' : 'desativado'}`,
            icon: TicketPercent,
            run: go(() => void navigate({ to: '/admin/cupons', search: { codigo: c.code } })),
          }))
      : []
    return [...areas, ...nftItems, ...couponItems]
  }, [q, debounced, nfts.data, coupons.data, navigate, close])

  // Lista mudou: a seleção volta ao primeiro resultado.
  useEffect(() => setActive(0), [q])
  const current = Math.min(active, Math.max(0, results.length - 1))
  const optionId = (i: number) => `${listId}-opt-${i}`

  useEffect(() => {
    listRef.current?.querySelector(`#${CSS.escape(optionId(current))}`)?.scrollIntoView({ block: 'nearest' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current])

  const searchingNfts = q.length >= 2 && (fold(debounced) !== q || nfts.isFetching)
  const groups = (['Áreas', 'NFTs', 'Cupons'] as const).map((g) => ({ g, items: results.map((r, i) => ({ r, i })).filter(({ r }) => r.group === g) }))

  return (
    <DialogContent
      showCloseButton={false}
      className="kpanel top-[12vh] w-[min(640px,calc(100%-2rem))] max-w-none translate-y-0 gap-0 overflow-hidden rounded-2xl border border-[var(--kp-linha-forte)] bg-[var(--kp-lousa)] p-0 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)] sm:max-w-none"
      data-testid="command-palette"
      onOpenAutoFocus={(e) => {
        e.preventDefault()
        ;(e.currentTarget as HTMLElement).querySelector('input')?.focus()
      }}
    >
      <DialogTitle className="sr-only">Buscar no painel</DialogTitle>
      <DialogDescription className="sr-only">Digite o nome de uma área, de um NFT ou de um cupom. Use as setas para escolher e Enter para abrir.</DialogDescription>
      <div className="flex items-center gap-3 border-b border-[var(--kp-linha)] px-4">
        <Search className="size-[18px] shrink-0 text-[var(--kp-laranja-texto)]" aria-hidden="true" />
        <input
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={results.length ? optionId(current) : undefined}
          aria-autocomplete="list"
          aria-label="Buscar no painel"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              if (!results.length) return
              setActive((current + (e.key === 'ArrowDown' ? 1 : results.length - 1)) % results.length)
            } else if (e.key === 'Enter') {
              e.preventDefault()
              results[current]?.run()
            }
          }}
          placeholder="Área, NFT ou cupom…"
          className="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-[var(--kp-tinta)] outline-none placeholder:text-[var(--kp-fumaca)] focus-visible:outline-none"
          spellCheck={false}
          autoComplete="off"
        />
        <kbd className="kp-kbd">Esc</kbd>
      </div>

      <ul ref={listRef} id={listId} role="listbox" aria-label="Resultados" className="max-h-[min(56vh,460px)] overflow-y-auto p-2">
        {groups.map(({ g, items }) =>
          items.length === 0 ? null : (
            <li key={g} role="presentation">
              <p className="kp-rotulo px-3 pb-1.5 pt-3" aria-hidden="true">
                {g}
              </p>
              <ul role="group" aria-label={g}>
                {items.map(({ r, i }) => (
                  <li
                    key={r.id}
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === current}
                    onMouseMove={() => i !== current && setActive(i)}
                    onClick={() => r.run()}
                    data-testid="palette-option"
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2.5 transition-colors',
                      i === current ? 'bg-[rgb(210_138_76/0.14)] text-[var(--kp-tinta)]' : 'text-[var(--kp-grafite)]',
                    )}
                  >
                    <r.icon className={cn('size-4 shrink-0', i === current ? 'text-[var(--kp-laranja-texto)]' : 'text-[var(--kp-fumaca)]')} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold">{r.label}</span>
                      <span className="block truncate text-[12px] text-[var(--kp-fumaca)]">{r.hint}</span>
                    </span>
                    {i === current && <CornerDownLeft className="size-4 shrink-0 text-[var(--kp-fumaca)]" aria-hidden="true" />}
                  </li>
                ))}
              </ul>
            </li>
          ),
        )}
        {results.length === 0 && !searchingNfts && (
          <li role="presentation" className="px-3 py-10 text-center text-[13.5px] text-[var(--kp-grafite)]">
            Nada com “{term.trim()}”. Tente o nome do NFT, a coleção, o id (nft-01) ou o código do cupom.
          </li>
        )}
      </ul>

      <div className="flex items-center justify-between gap-3 border-t border-[var(--kp-linha)] px-4 py-2.5 text-[11.5px] text-[var(--kp-fumaca)]">
        <span role="status" aria-live="polite">
          {searchingNfts ? 'Buscando NFTs…' : `${results.length} ${results.length === 1 ? 'resultado' : 'resultados'}`}
        </span>
        <span className="hidden items-center gap-1.5 sm:flex" aria-hidden="true">
          <kbd className="kp-kbd">↑</kbd>
          <kbd className="kp-kbd">↓</kbd> escolher <kbd className="kp-kbd">Enter</kbd> abrir
        </span>
      </div>
    </DialogContent>
  )
}
