/**
 * BUSCA GLOBAL do painel (Ctrl+K ou Ctrl+F, ou o botão do trilho/cabeçalho).
 *
 * Um modal, e não um campo fixo: aparece quando se pede e some quando se escolhe. Leva a qualquer área e
 * também a um NFT ou cupom pelo nome. As áreas respondem na hora (já estão na memória); os NFTs vêm da API
 * (/admin/nfts?q=, a partir de 2 letras e depois de uma pausa na digitação); os cupons vêm da lista do painel.
 *
 * Também troca o tema do painel ("Tema: claro", "Tema: escuro", "Tema: igual ao sistema").
 * Enquanto os NFTs do termo chegam, o grupo NFTs mostra linhas skeleton do tamanho das opções.
 *
 * Teclado: setas andam pela lista inteira (áreas, NFTs e cupons na ordem da tela), Enter abre, Esc fecha.
 * Padrão combobox + listbox com aria-activedescendant: o foco fica no campo o tempo todo (preso no diálogo).
 */
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { CornerDownLeft, ExternalLink, Gem, Monitor, Moon, Search, Sun, TicketPercent, type LucideIcon } from 'lucide-react'
import { useEffect, useEffectEvent, useId, useMemo, useRef, useState } from 'react'
import { adminCouponsQuery, adminSearchNftsQuery } from '@/api/queries'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useSession } from '@/features/auth/use-session'
import { formatEth } from '@/lib/eth'
import { cn } from '@/lib/utils'
import { PANEL_THEME_OPTIONS, setPanelThemeChoice, usePanelTheme, type PanelThemeChoice } from './panel-theme'
import { PANEL_SECTIONS } from './sections'

const THEME_ICON: Record<PanelThemeChoice, LucideIcon> = { escuro: Moon, claro: Sun, sistema: Monitor }
const THEME_WORDS: Record<PanelThemeChoice, string> = { escuro: 'dark noite preto', claro: 'light dia branco', sistema: 'sistema automatico automático auto os' }

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

interface Result {
  id: string
  group: 'Áreas' | 'NFTs' | 'Cupons' | 'Tema'
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
  const { choice: themeChoice } = usePanelTheme()

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
    // Tema: cada palavra digitada precisa aparecer ("tema claro", "modo escuro", "aparência sistema"...).
    const themeItems: Result[] = PANEL_THEME_OPTIONS.filter((o) => {
      const hay = fold(`tema aparencia cor modo ${o.label} ${THEME_WORDS[o.value]}`)
      return !q || q.split(/\s+/).every((w) => hay.includes(w))
    }).map((o) => ({
      id: `tema:${o.value}`,
      group: 'Tema',
      label: `Tema: ${o.short}`,
      hint: o.value === themeChoice ? 'Em uso agora' : o.value === 'sistema' ? 'Segue o claro ou escuro do sistema' : `Painel com fundo ${o.value === 'claro' ? 'claro' : 'escuro'}`,
      icon: THEME_ICON[o.value],
      run: go(() => setPanelThemeChoice(o.value)),
    }))
    return [...areas, ...nftItems, ...couponItems, ...themeItems]
  }, [q, debounced, nfts.data, coupons.data, navigate, close, themeChoice])

  // Lista mudou: a seleção volta ao primeiro resultado (ajustado durante a renderização).
  const [activeFor, setActiveFor] = useState(q)
  if (activeFor !== q) {
    setActiveFor(q)
    setActive(0)
  }
  const current = Math.min(active, Math.max(0, results.length - 1))
  const optionId = (i: number) => `${listId}-opt-${i}`

  const scrollToOption = useEffectEvent((i: number) => {
    listRef.current?.querySelector(`#${CSS.escape(optionId(i))}`)?.scrollIntoView({ block: 'nearest' })
  })
  useEffect(() => scrollToOption(current), [current])

  const searchingNfts = q.length >= 2 && (fold(debounced) !== q || nfts.isFetching)
  const groups = (['Áreas', 'NFTs', 'Cupons', 'Tema'] as const).map((g) => ({ g, items: results.map((r, i) => ({ r, i })).filter(({ r }) => r.group === g) }))

  return (
    <DialogContent
      showCloseButton={false}
      className="kpanel kp-paleta top-[12vh] w-[min(640px,calc(100%-2rem))] max-w-none translate-y-0 gap-0 overflow-hidden rounded-2xl border border-[var(--kp-linha-forte)] bg-[var(--kp-lousa)] p-0 shadow-[var(--kp-sombra-modal)] sm:max-w-none"
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

      <ul ref={listRef} id={listId} role="listbox" aria-label="Resultados" aria-busy={searchingNfts || undefined} className="max-h-[min(56vh,460px)] overflow-y-auto p-2">
        {groups.map(({ g, items }) =>
          items.length === 0 ? (
            g === 'NFTs' && searchingNfts ? <PaletteSkeletonGroup key={g} label={g} /> : null
          ) : (
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

/** NFTs do termo ainda chegando: duas linhas no formato exato das opções (ícone, nome, coleção · preço · id). */
function PaletteSkeletonGroup({ label }: { label: string }) {
  return (
    <li role="presentation" aria-hidden="true" data-testid="palette-skeleton">
      <p className="kp-rotulo px-3 pb-1.5 pt-3">{label}</p>
      <ul role="presentation">
        {['Emerald Ape #042', 'Cosmic Owl #07'].map((name) => (
          <li key={name} role="presentation" className="flex items-center gap-3 rounded-[10px] px-3 py-2.5">
            <span className="kp-sk-bloco size-4 shrink-0 rounded-[4px]" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold">
                <span className="kp-sk">{name}</span>
              </span>
              <span className="block truncate text-[12px]">
                <span className="kp-sk">Coleção Kurio · 0.25 ETH · nft-00</span>
              </span>
            </span>
          </li>
        ))}
      </ul>
    </li>
  )
}
