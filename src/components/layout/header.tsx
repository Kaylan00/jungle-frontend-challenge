import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { LogIn, Search, ShoppingCart, User, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useLogout, useSession } from '@/features/auth/use-session'
import { useCartCount } from '@/features/cart/hooks'
import { cn } from '@/lib/utils'
import { RealtimeBadge } from './realtime-badge'

const navItem =
  'relative py-2 text-[15px] text-foreground/90 transition-colors hover:text-primary after:absolute after:inset-x-0 after:-bottom-[13px] after:h-0.5 after:bg-transparent'

export function Header() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const marketActive = pathname.startsWith('/nft') || pathname.startsWith('/carrinho') || pathname.startsWith('/pagamento')
  const homeActive = pathname === '/' && !marketActive
  const count = useCartCount()
  const { user } = useSession()
  const logout = useLogout()
  const navigate = useNavigate()
  const [searchOpen, setSearchOpen] = useState(false)
  const [term, setTerm] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus()
  }, [searchOpen])

  return (
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container-page flex h-16 items-center justify-between gap-4 border-b border-border/70">
        <Link to="/" className="text-sm font-bold tracking-[0.12em]" aria-label="Kurio, página inicial">
          KURIO
        </Link>

        <nav aria-label="Principal" className="hidden items-center gap-8 md:flex">
          <Link to="/" className={cn(navItem, homeActive && 'text-primary after:bg-primary')} aria-current={homeActive ? 'page' : undefined}>
            Início
          </Link>
          <Link
            to="/"
            hash="catalogo"
            className={cn(navItem, marketActive && 'text-primary after:bg-primary')}
            aria-current={marketActive ? 'page' : undefined}
          >
            Mercado
          </Link>
          {['Criadores', 'Aprenda'].map((label) => (
            <Tooltip key={label}>
              <TooltipTrigger asChild>
                <span className={cn(navItem, 'cursor-not-allowed text-foreground/60 hover:text-foreground/60')} aria-disabled="true" tabIndex={0}>
                  {label}
                </span>
              </TooltipTrigger>
              <TooltipContent>Em breve: fora do escopo desta demonstração</TooltipContent>
            </Tooltip>
          ))}
        </nav>

        <div className="flex items-center gap-2 md:gap-4">
          <RealtimeBadge />
          {searchOpen ? (
            <form
              role="search"
              className="flex items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault()
                void navigate({ to: '/', search: (prev) => ({ ...prev, q: term.trim() || undefined, page: undefined }), hash: 'catalogo' })
                setSearchOpen(false)
              }}
            >
              <label htmlFor="header-search" className="sr-only">
                Buscar NFTs
              </label>
              <input
                id="header-search"
                ref={inputRef}
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setSearchOpen(false)}
                placeholder="Buscar NFTs…"
                className="h-9 w-40 rounded-md border border-border bg-card px-3 text-sm md:w-56"
              />
              <button type="button" className="rounded-md p-2 hover:bg-secondary" onClick={() => setSearchOpen(false)} aria-label="Fechar busca">
                <X className="size-4" aria-hidden="true" />
              </button>
            </form>
          ) : (
            <button type="button" className="hidden rounded-md p-2 hover:bg-secondary md:inline-flex" onClick={() => setSearchOpen(true)} aria-label="Abrir busca">
              <Search className="size-5" aria-hidden="true" />
            </button>
          )}

          <Link to="/carrinho" className="relative hidden rounded-md p-2 hover:bg-secondary md:inline-flex" aria-label={`Carrinho, ${count} ${count === 1 ? 'item' : 'itens'}`}>
            <ShoppingCart className="size-5" aria-hidden="true" />
            {count > 0 && (
              <span className="absolute right-0.5 top-0.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold leading-4 text-primary-foreground" data-testid="cart-count">
                {count}
              </span>
            )}
          </Link>

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="hidden items-center gap-2 rounded-md border border-primary/60 px-3 py-1.5 text-sm text-primary hover:bg-secondary md:inline-flex" aria-label={`Menu da conta de ${user.name}`}>
                {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="size-5 rounded-full object-cover" /> : <User className="size-4" aria-hidden="true" />}
                <span className="max-w-28 truncate">{user.username}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void navigate({ to: '/perfil' })}>Dados do perfil</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void navigate({ to: '/perfil/carteiras' })}>Carteiras</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void navigate({ to: '/perfil/favoritos' })}>Lista de interesse</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() =>
                    logout.mutate(undefined, {
                      onSettled: () => void navigate({ to: '/' }),
                    })
                  }
                >
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link
              to="/login"
              search={{ redirect: pathname === '/login' ? undefined : pathname }}
              className="hidden items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary-hover md:inline-flex"
            >
              <LogIn className="size-4" aria-hidden="true" />
              Entrar
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
