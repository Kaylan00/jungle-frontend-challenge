/**
 * Layout comum das páginas da conta (perfil, carteiras, lista de interesse).
 * No desktop o menu "Meu perfil" fica num card à esquerda (Figma); no celular vira uma faixa
 * horizontal com rolagem acima do conteúdo. Itens fora do escopo do desafio aparecem
 * desativados (aria-disabled + "Em breve") para não parecer que funcionam.
 */
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { Activity, Download, HandCoins, Heart, LifeBuoy, LogOut, UserRound, Wallet, type LucideIcon } from 'lucide-react'
import { useLogout } from '@/features/auth/use-session'
import { cn } from '@/lib/utils'

type MenuItem = { label: string; icon: LucideIcon; to?: '/perfil' | '/perfil/carteiras' | '/perfil/favoritos' }

const menu: MenuItem[] = [
  { label: 'Dados do perfil', icon: UserRound, to: '/perfil' },
  { label: 'Carteiras', icon: Wallet, to: '/perfil/carteiras' },
  { label: 'Atividade', icon: Activity },
  { label: 'Lista de interesse', icon: Heart, to: '/perfil/favoritos' },
  { label: 'Ofertas', icon: HandCoins },
  { label: 'Arquivos baixados', icon: Download },
  { label: 'Suporte', icon: LifeBuoy },
]

const itemBase =
  'relative flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2.5 text-[13px] text-primary md:whitespace-normal'

const activeBar =
  'bg-secondary/70 before:absolute before:rounded-full before:bg-primary before:inset-x-3 before:bottom-0 before:h-[3px] md:before:inset-x-auto md:before:inset-y-1.5 md:before:left-0 md:before:h-auto md:before:w-[3px]'

export function ProfileLayout({ title, children }: { title: string; children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname.replace(/\/$/, '') || '/' })
  const logout = useLogout()
  const navigate = useNavigate()

  return (
    <div className="container-page grid gap-6 py-6 md:grid-cols-[172px_minmax(0,1fr)] md:gap-10 md:py-10">
      <h1 className="sr-only">{title}</h1>
      <aside className="min-w-0 self-start rounded-lg bg-card md:py-3">
        <nav aria-labelledby="profile-menu-title">
          <h2 id="profile-menu-title" className="hidden px-3 pb-2 pt-1 text-[14px] font-bold md:block">
            Meu perfil
          </h2>
          <ul className="flex gap-1 overflow-x-auto p-1.5 md:flex-col md:overflow-visible md:p-0 md:px-1.5">
            {menu.map(({ label, icon: Icon, to }) => {
              if (!to) {
                return (
                  <li key={label} className="shrink-0">
                    <span aria-disabled="true" title="Em breve" className={cn(itemBase, 'cursor-not-allowed text-muted-foreground/70')}>
                      <Icon className="size-4 shrink-0" aria-hidden="true" />
                      <span className="flex flex-col leading-tight">
                        {label}
                        <span className="text-[10px] uppercase tracking-wide">Em breve</span>
                      </span>
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
                      'hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      active && activeBar,
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    {label}
                  </Link>
                </li>
              )
            })}
            <li aria-hidden="true" className="mx-1 w-px shrink-0 self-stretch bg-border md:mx-3 md:my-2 md:h-px md:w-auto" />
            <li className="shrink-0">
              <button
                type="button"
                disabled={logout.isPending}
                onClick={() => logout.mutate(undefined, { onSettled: () => void navigate({ to: '/' }) })}
                className={cn(itemBase, 'w-full text-left hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60')}
              >
                <LogOut className="size-4 shrink-0" aria-hidden="true" />
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
