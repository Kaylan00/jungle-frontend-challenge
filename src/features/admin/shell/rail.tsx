/**
 * O TRILHO: a navegação do Kurio Admin, escura e solta ao lado da lousa.
 *
 * - Ícone e nome na mesma linha; o lugar onde se está é a pílula laranja (a única cor forte da coluna) e
 *   leva aria-current="page".
 * - Recolhe para 76px (só ícones, com o nome na dica e para o leitor de tela). A escolha fica gravada; sem
 *   escolha, entre 768 e 1199px ele nasce recolhido, para devolver largura à lousa.
 * - No celular ele não existe ao lado: o mesmo conteúdo abre por cima, num diálogo com foco preso (PanelShell).
 * - Pedidos mostra quantos estão pendentes (número da API, atualizado pelo socket).
 * - Enquanto a casca confere o acesso (pending), o mesmo trilho aparece com o nome da conta em skeleton e os
 *   botões que dependem da sessão (buscar, recolher, sair) ainda inativos: nada muda de lugar depois.
 * - Tema do painel (escuro, claro ou igual ao sistema) no rodapé: grupo de opções (radiogroup) com setas, nos
 *   três estados do trilho (aberto, recolhido e no menu do celular).
 */
import { Link } from '@tanstack/react-router'
import { ChevronsLeft, ExternalLink, LogOut, Monitor, Moon, Search, Sun, type LucideIcon } from 'lucide-react'
import { useRef } from 'react'
import { useSession } from '@/features/auth/use-session'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useAdminOverview } from '../hooks'
import { PANEL_THEME_OPTIONS, usePanelTheme, type PanelThemeChoice } from './panel-theme'
import { Sk, SkBlock } from '../sections/ui'
import { PANEL_SECTIONS } from './sections'

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

function initials(name: string | undefined) {
  const first = (name ?? '').trim().split(/\s+/)[0]
  return first ? first.slice(0, 3).toUpperCase() : 'ADM'
}

/** Dica com o nome do item quando o trilho está recolhido (o nome continua no link para leitor de tela). */
function Hint({ show, label, children }: { show: boolean; label: string; children: React.ReactElement }) {
  if (!show) return children
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={10}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

const THEME_ICON: Record<PanelThemeChoice, LucideIcon> = { escuro: Moon, claro: Sun, sistema: Monitor }

/**
 * Tema do painel: três opções num grupo (radiogroup). Setas (e Home/End) trocam e levam o foco, como num grupo
 * de rádios; só a opção marcada fica na ordem do Tab. Cada opção tem o nome completo (leitor de tela e dica).
 */
export function ThemeSwitch({ vertical = false }: { vertical?: boolean }) {
  const { choice, setChoice } = usePanelTheme()
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const move = (e: React.KeyboardEvent, i: number) => {
    const n = PANEL_THEME_OPTIONS.length
    const next =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? (i + 1) % n
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? (i + n - 1) % n
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? n - 1
              : null
    if (next === null) return
    e.preventDefault()
    setChoice(PANEL_THEME_OPTIONS[next].value)
    refs.current[next]?.focus()
  }
  return (
    <div role="radiogroup" aria-label="Tema do painel" aria-orientation={vertical ? 'vertical' : 'horizontal'} className={cn('kp-tema', vertical && 'flex-col')} data-testid="panel-theme">
      {PANEL_THEME_OPTIONS.map((o, i) => {
        const Icon = THEME_ICON[o.value]
        const checked = choice === o.value
        return (
          <Hint key={o.value} show label={`Tema: ${o.short}`}>
            <button
              ref={(el) => {
                refs.current[i] = el
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={o.label}
              tabIndex={checked ? 0 : -1}
              onClick={() => setChoice(o.value)}
              onKeyDown={(e) => move(e, i)}
            >
              <Icon className="size-[15px]" strokeWidth={1.9} aria-hidden="true" />
            </button>
          </Hint>
        )
      })}
    </div>
  )
}

export function RailContent({
  collapsed = false,
  onToggle,
  onSearch,
  onLogout,
  loggingOut,
  onNavigate,
  pending = false,
}: {
  collapsed?: boolean
  onToggle?: () => void
  onSearch: () => void
  onLogout: () => void
  loggingOut: boolean
  onNavigate?: () => void
  /** Skeleton da casca (acesso sendo conferido): sem consultas do painel e sem ações que dependem da sessão. */
  pending?: boolean
}) {
  const { user } = useSession()
  const accountLoading = pending || !user
  const label = (text: string) => <span className={collapsed ? 'sr-only' : 'truncate'}>{text}</span>

  return (
    <div className={cn('flex h-full min-h-0 flex-col gap-5 py-5', collapsed ? 'px-3' : 'px-4')}>
      <div className={cn('flex items-center gap-2', collapsed && 'flex-col')}>
        <Link to="/admin" onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1.5 py-1" aria-label="Kurio Admin: visão geral">
          <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[var(--kp-laranja)] text-[15px] font-black text-[#140d0a]">
            K
          </span>
          {!collapsed && (
            <span className="min-w-0 leading-tight">
              <span className="block text-[15px] font-bold tracking-[0.12em]">KURIO</span>
              <span className="block text-[10.5px] font-semibold uppercase tracking-[0.22em] text-[var(--kp-laranja-texto)]">Admin</span>
            </span>
          )}
        </Link>
        {onToggle && (
          <Hint show={collapsed} label="Abrir o menu">
            <button
              type="button"
              onClick={onToggle}
              disabled={pending}
              aria-label={collapsed ? 'Abrir o menu' : 'Recolher o menu'}
              aria-expanded={!collapsed}
              aria-controls="kp-trilho"
              className="grid size-8 shrink-0 place-items-center rounded-lg text-[var(--kp-fumaca)] transition-colors hover:bg-[rgb(var(--kp-veu-rgb)/0.05)] hover:text-[var(--kp-tinta)]"
            >
              <ChevronsLeft className={cn('size-4 transition-transform duration-200', collapsed && 'rotate-180')} aria-hidden="true" />
            </button>
          </Hint>
        )}
      </div>

      {/* O campo que não é campo: parece busca, é o botão que abre a busca global (um lugar só onde se busca). */}
      <Hint show={collapsed} label="Buscar (Ctrl K)">
        <button
          type="button"
          onClick={onSearch}
          disabled={pending}
          className={cn(
            'flex h-10 items-center gap-2.5 rounded-[10px] border border-[var(--kp-linha)] text-[13px] text-[var(--kp-fumaca)] transition-colors hover:border-[var(--kp-linha-forte)] hover:text-[var(--kp-tinta)]',
            collapsed ? 'justify-center px-0' : 'px-3',
          )}
          aria-keyshortcuts="Control+K Control+F Meta+K"
        >
          <Search className="size-4 shrink-0" aria-hidden="true" />
          {label('Buscar')}
          {/* O atalho só aparece onde há teclado (o trilho fixo do desktop), não no menu do celular. */}
          {!collapsed && onToggle && <kbd className="kp-kbd ml-auto">{isMac() ? '⌘ K' : 'Ctrl K'}</kbd>}
        </button>
      </Hint>

      <nav aria-label="Áreas do painel" className="min-h-0 flex-1 overflow-y-auto">
        {!collapsed && <p className="kp-rotulo mb-2 px-3">Painel</p>}
        <ul className="flex flex-col gap-1">
          {PANEL_SECTIONS.map((s) => (
            <li key={s.to}>
              <Hint show={collapsed} label={s.label}>
                <Link
                  to={s.to}
                  onClick={onNavigate}
                  activeOptions={{ exact: s.to === '/admin', includeSearch: false }}
                  activeProps={{ 'aria-current': 'page' }}
                  className={cn('kp-trilho-item', collapsed && 'justify-center px-0')}
                >
                  <s.icon className="size-[18px]" strokeWidth={1.75} aria-hidden="true" />
                  {label(s.label)}
                  {s.to === '/admin/pedidos' && !pending && <PendingOrdersBadge collapsed={collapsed} />}
                </Link>
              </Hint>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex flex-col gap-1 border-t border-[var(--kp-linha)] pt-4">
        <Hint show={collapsed} label="Ver loja (nova aba)">
          <a href="/" target="_blank" rel="noopener" className={cn('kp-trilho-item', collapsed && 'justify-center px-0')}>
            <ExternalLink className="size-[18px]" strokeWidth={1.75} aria-hidden="true" />
            {label('Ver loja')}
            <span className="sr-only"> (abre em nova aba)</span>
            {!collapsed && (
              <span aria-hidden="true" className="ml-auto text-[var(--kp-fumaca)]">
                ↗
              </span>
            )}
          </a>
        </Hint>

        {collapsed ? (
          <div className="flex justify-center py-1">
            <ThemeSwitch vertical />
          </div>
        ) : (
          <div className="flex min-h-[42px] items-center justify-between gap-3 pl-3 text-[13.5px] font-medium text-[var(--kp-trilho-tinta)]">
            <span aria-hidden="true">Tema</span>
            <ThemeSwitch />
          </div>
        )}

        <div className={cn('mt-2 flex items-center gap-2.5 rounded-[12px] bg-[rgb(var(--kp-veu-rgb)/0.03)] p-2', collapsed && 'flex-col bg-transparent p-0')}>
          {accountLoading ? (
            <SkBlock className="size-9 shrink-0 rounded-full" />
          ) : (
            <span
              aria-hidden="true"
              className="grid size-9 shrink-0 place-items-center rounded-full border border-[var(--kp-linha-forte)] text-[10.5px] font-bold tracking-[0.06em] text-[var(--kp-laranja-texto)]"
            >
              {initials(user?.name)}
            </span>
          )}
          {!collapsed && (
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[13px] font-semibold" data-testid="panel-account-name">
                {accountLoading ? <Sk>Administrador Kurio</Sk> : user?.name}
              </span>
              <span className="block truncate text-[11.5px] text-[var(--kp-fumaca)]">Administrador</span>
            </span>
          )}
          <Hint show label="Sair do painel">
            <button
              type="button"
              onClick={onLogout}
              disabled={loggingOut || pending}
              aria-label="Sair do painel"
              className="grid size-8 shrink-0 place-items-center rounded-lg text-[var(--kp-fumaca)] transition-colors hover:bg-[rgb(var(--kp-veu-rgb)/0.05)] hover:text-[var(--kp-tinta)] disabled:opacity-50"
            >
              <LogOut className="size-4" aria-hidden="true" />
            </button>
          </Hint>
        </div>
      </div>
    </div>
  )
}

/** Pedidos pendentes no item Pedidos (número da API, atualizado pelo socket). */
function PendingOrdersBadge({ collapsed }: { collapsed: boolean }) {
  const overview = useAdminOverview()
  const pending = overview.data?.orders.pending ?? 0
  if (pending <= 0) return null
  return (
    <span className={cn('kp-contador', collapsed && 'absolute -right-1 -top-1 ml-0')} data-testid="rail-pending">
      {pending}
      <span className="sr-only"> {pending === 1 ? 'pendente' : 'pendentes'}</span>
    </span>
  )
}
