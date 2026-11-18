/**
 * Layout comum das páginas da conta (perfil, carteiras, lista de interesse).
 * No desktop o menu "Meu perfil" fica num card à esquerda (Figma); no celular vira uma faixa
 * horizontal com rolagem acima do conteúdo. Itens fora do escopo do desafio levam a uma tela
 * "Em breve" dentro deste layout (coming-soon-page.tsx), sem simular funcionalidade.
 */
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { ArrowDownToLine, Heart, LogOut, MapPin, ShoppingCart, SquareActivity, TriangleAlert, UserRound, type LucideIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useLogout } from '@/features/auth/use-session'
import { cn } from '@/lib/utils'

/** `to`: página da conta. `soon`: seção fora do escopo, que abre a tela "Em breve" (/perfil/<soon>). */
type MenuItem = { label: string; icon: LucideIcon } & ({ to: '/perfil' | '/perfil/carteiras' | '/perfil/favoritos' } | { soon: string })

const menu: MenuItem[] = [
  { label: 'Dados do perfil', icon: UserRound, to: '/perfil' },
  { label: 'Carteiras', icon: MapPin, to: '/perfil/carteiras' },
  { label: 'Atividade', icon: ShoppingCart, soon: 'atividade' },
  { label: 'Lista de interesse', icon: Heart, to: '/perfil/favoritos' },
  { label: 'Ofertas', icon: SquareActivity, soon: 'ofertas' },
  { label: 'Arquivos baixados', icon: ArrowDownToLine, soon: 'arquivos-baixados' },
  { label: 'Suporte', icon: TriangleAlert, soon: 'suporte' },
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
  const listRef = useRef<HTMLUListElement>(null)

  // Celular: o menu é uma faixa com rolagem lateral; o item da página aberta fica à vista (ex.: "Ofertas").
  useEffect(() => {
    const list = listRef.current
    const current = list?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!list || !current || list.scrollWidth <= list.clientWidth) return
    const l = list.getBoundingClientRect()
    const c = current.getBoundingClientRect()
    list.scrollLeft += c.left - l.left - (l.width - c.width) / 2
  }, [pathname])

  return (
    <div className="container-page grid gap-6 py-6 md:grid-cols-[310px_minmax(0,1fr)] md:gap-7 md:pb-16 md:pt-8 wide:grid-cols-[calc(310*var(--u))_minmax(0,1fr)] wide:gap-x-[calc(28*var(--u))]">
      <h1 className="sr-only">{title}</h1>
      <aside className="min-w-0 self-start rounded-lg bg-[#241612] md:rounded-none md:pb-2 md:pt-[14px]">
        <nav aria-labelledby="profile-menu-title">
          <h2 id="profile-menu-title" className="hidden pb-1.5 pl-[11px] text-[18px] font-bold leading-6 text-[#f5f1eb] md:block">
            Meu perfil
          </h2>
          <ul ref={listRef} className="flex gap-1 overflow-x-auto p-1.5 md:flex-col md:gap-0 md:overflow-visible md:p-0">
            {menu.map((item) => {
              const { label, icon: Icon } = item
              const href = 'to' in item ? item.to : `/perfil/${item.soon}`
              const active = pathname === href
              const target = 'to' in item ? { to: item.to } : { to: '/perfil/$secao' as const, params: { secao: item.soon } }
              return (
                <li key={label} className="shrink-0">
                  <Link
                    {...target}
                    // Só a página exata conta como atual: sem isto o roteador marcaria "Dados do perfil" (/perfil)
                    // também como aria-current em /perfil/carteiras, /perfil/ofertas etc.
                    activeOptions={{ exact: true }}
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
