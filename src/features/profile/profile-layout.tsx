/**
 * Layout comum das páginas da conta (perfil, carteiras, lista de interesse).
 * No desktop o menu "Meu perfil" fica num card à esquerda (Figma); no celular vira uma faixa
 * horizontal com rolagem acima do conteúdo. Itens fora do escopo do desafio aparecem
 * desativados (aria-disabled + "Em breve") para não parecer que funcionam.
 */
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { ArrowDownToLine, Heart, LayoutDashboard, LogOut, MapPin, ShoppingCart, SquareActivity, TriangleAlert, UserRound, type LucideIcon } from 'lucide-react'
import { useLogout, useSession } from '@/features/auth/use-session'
import { cn } from '@/lib/utils'

type MenuItem = { label: string; icon: LucideIcon; to?: '/perfil' | '/perfil/carteiras' | '/perfil/favoritos' | '/admin' }

/** Só para admin (no celular não há o menu da conta do cabeçalho): atalho para o painel. A API confere o papel. */
const adminItem: MenuItem = { label: 'Painel', icon: LayoutDashboard, to: '/admin' }

const menu: MenuItem[] = [
  { label: 'Dados do perfil', icon: UserRound, to: '/perfil' },
  { label: 'Carteiras', icon: MapPin, to: '/perfil/carteiras' },
  { label: 'Atividade', icon: ShoppingCart },
  { label: 'Lista de interesse', icon: Heart, to: '/perfil/favoritos' },
  { label: 'Ofertas', icon: SquareActivity },
  { label: 'Arquivos baixados', icon: ArrowDownToLine },
  { label: 'Suporte', icon: TriangleAlert },
]

/** Item do menu no Figma: 45px de altura, texto 15px laranja, ícone 18px bege; no celular vira "chip". */
const itemBase =
  'relative flex shrink-0 items-center gap-3 whitespace-nowrap rounded-md px-3 py-2.5 text-[15px] leading-5 text-[#e89b55] md:h-[45px] md:rounded-none md:pb-[2px] md:pt-0 md:pl-4 md:pr-3'

const activeBar =
  'bg-secondary/70 before:absolute before:rounded-full before:bg-[#d28a4c] before:inset-x-3 before:bottom-0 before:h-[3px] md:bg-transparent md:before:inset-x-auto md:before:inset-y-0 md:before:left-0 md:before:h-auto md:before:w-[6px] md:before:rounded-none'

export function ProfileLayout({ title, children }: { title: string; children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname.replace(/\/$/, '') || '/' })
  const logout = useLogout()
  const navigate = useNavigate()
  const { user } = useSession()
  const items = user?.role === 'admin' ? [...menu, adminItem] : menu

  return (
    <div className="container-page grid gap-6 py-6 md:grid-cols-[310px_minmax(0,1fr)] md:gap-7 md:pb-16 md:pt-8 wide:grid-cols-[calc(310*var(--u))_minmax(0,1fr)] wide:gap-x-[calc(28*var(--u))]">
      <h1 className="sr-only">{title}</h1>
      <aside className="min-w-0 self-start rounded-lg bg-[#241612] md:rounded-none md:pb-2 md:pt-[14px]">
        <nav aria-labelledby="profile-menu-title">
          <h2 id="profile-menu-title" className="hidden pb-1.5 pl-[11px] text-[18px] font-bold leading-6 text-[#f5f1eb] md:block">
            Meu perfil
          </h2>
          <ul className="flex gap-1 overflow-x-auto p-1.5 md:flex-col md:gap-0 md:overflow-visible md:p-0">
            {items.map(({ label, icon: Icon, to }) => {
              if (!to) {
                return (
                  <li key={label} className="shrink-0">
                    <span aria-disabled="true" title="Em breve" className={cn(itemBase, 'cursor-not-allowed')}>
                      <Icon className="size-[18px] shrink-0 text-[#b39463]" strokeWidth={1.5} aria-hidden="true" />
                      {label}
                      <span className="sr-only"> (em breve)</span>
                    </span>
                  </li>
                )
              }
              const active = pathname === to
              return (
                <li key={label} className="shrink-0">
                  <Link
                    to={to}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      itemBase,
                      'hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                      active && activeBar,
                    )}
                  >
                    <Icon className={cn('size-[18px] shrink-0', active ? 'text-[#d28a4c]' : 'text-[#b39463]')} strokeWidth={1.5} aria-hidden="true" />
                    {label}
                  </Link>
                </li>
              )
            })}
            <li aria-hidden="true" className="mx-1 w-px shrink-0 self-stretch bg-border md:mx-0 md:-mt-px md:h-px md:w-auto md:bg-[#503320]" />
            <li className="shrink-0">
              <button
                type="button"
                disabled={logout.isPending}
                onClick={() => logout.mutate(undefined, { onSettled: () => void navigate({ to: '/' }) })}
                className={cn(
                  itemBase,
                  'w-full text-left font-bold hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-60 md:h-10',
                )}
              >
                <LogOut className="size-[18px] shrink-0 text-[#d28a4c]" strokeWidth={1.5} aria-hidden="true" />
                {logout.isPending ? 'Saindo…' : 'Sair'}
              </button>
            </li>
          </ul>
        </nav>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  )
}
