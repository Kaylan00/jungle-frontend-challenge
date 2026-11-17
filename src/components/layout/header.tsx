import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { User, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useLogout, useSession } from '@/features/auth/use-session'
import { useCartCount } from '@/features/cart/hooks'
import { cn } from '@/lib/utils'

// Figma: itens em branco 16px, ativo em laranja negrito com sublinhado de 3px sobre a linha divisória.
const navItem =
  'relative flex h-full items-start pt-[23px] text-base leading-6 text-foreground transition-colors hover:text-highlight after:absolute after:inset-x-0 after:bottom-0 after:z-10 after:h-[3px] after:bg-transparent'
const navActive = 'font-bold text-highlight after:bg-primary'

function SearchIcon() {
  return (
    <svg viewBox="0 0 22 22" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="10" cy="9" r="8.1" />
      <path d="M16 15l4.6 4.6" />
    </svg>
  )
}

function CartIcon() {
  return (
    <svg viewBox="0 0 26 28" width="26" height="28" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1.8 1.8l4.4 5.4" />
      <path d="M6.2 7.2h17.6l-2.2 9.8H8.2" />
      <path d="M6.2 7.2l1.2 11.2c.1 1 .9 1.6 1.8 1.6h13.6" />
      <path d="M9 11.4h6" />
      <circle cx="9.6" cy="25" r=".7" fill="currentColor" />
      <circle cx="18.6" cy="25" r=".7" fill="currentColor" />
    </svg>
  )
}

function EnterIcon() {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13 5.2V4.6A3.8 3.8 0 0 0 9.2.8H4.6A3.8 3.8 0 0 0 .8 4.6v8.8a3.8 3.8 0 0 0 3.8 3.8h4.6a3.8 3.8 0 0 0 3.8-3.8v-.6" />
      <path d="M6.6 9h10.4M14.2 6.2 17 9l-2.8 2.8" />
    </svg>
  )
}

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
    <header className="sticky top-0 z-40 bg-background">
      <div className="container-page relative flex h-16 items-center justify-between gap-4 xl:h-[69px] xl:items-start xl:justify-start xl:gap-0">
        {/* Linha divisória (Figma: 1px em y=68, o sublinhado do item ativo passa por cima dela).
            Nos frames do Mercado (detalhe, carrinho, pagamento) o Figma não tem a linha. */}
        {!marketActive && <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-border" />}
        <Link to="/" className="text-sm font-bold leading-5 tracking-[0.1em] xl:mt-[31px]" aria-label="Kurio, página inicial">
          KURIO
        </Link>

        <nav aria-label="Principal" className="hidden h-full items-stretch gap-10 md:flex xl:absolute xl:left-[376px] xl:top-0 xl:gap-[40.5px]">
          <Link to="/" className={cn(navItem, homeActive && navActive)} aria-current={homeActive ? 'page' : undefined}>
            Início
          </Link>
          <Link to="/" hash="catalogo" className={cn(navItem, marketActive && navActive)} aria-current={marketActive ? 'page' : undefined}>
            Mercado
          </Link>
          {['Criadores', 'Aprenda'].map((label) => (
            <Tooltip key={label}>
              <TooltipTrigger asChild>
                <span className={cn(navItem, 'cursor-not-allowed hover:text-foreground')} aria-disabled="true" tabIndex={0}>
                  {label}
                </span>
              </TooltipTrigger>
              <TooltipContent>Em breve: fora do escopo desta demonstração</TooltipContent>
            </Tooltip>
          ))}
        </nav>

        <div className="flex items-center gap-2 md:gap-[26px] xl:ml-auto xl:mt-6 xl:h-[35px]">
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
            <button type="button" className="hidden rounded-sm transition-colors hover:text-highlight md:inline-flex" onClick={() => setSearchOpen(true)} aria-label="Abrir busca">
              <SearchIcon />
            </button>
          )}

          <Link
            to="/carrinho"
            className="relative hidden h-7 w-[33px] rounded-sm transition-colors hover:text-highlight md:mr-px md:inline-flex"
            aria-label={`Carrinho, ${count} ${count === 1 ? 'item' : 'itens'}`}
          >
            <CartIcon />
            {count > 0 && (
              <span
                className="absolute left-4 top-px grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold leading-4 text-primary-foreground"
                data-testid="cart-count"
              >
                {count}
              </span>
            )}
          </Link>

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="hidden h-[35px] min-w-[100px] items-center justify-center gap-1.5 rounded-[5px] bg-primary px-2.5 text-base text-primary-foreground transition-colors hover:bg-primary-hover md:inline-flex" aria-label={`Menu da conta de ${user.name}`}>
                {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="size-5 rounded-full object-cover" /> : <User className="size-[18px]" aria-hidden="true" />}
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
              className="hidden h-[35px] w-[100px] items-center justify-center gap-1.5 rounded-[5px] bg-primary text-base text-primary-foreground transition-colors hover:bg-primary-hover md:inline-flex"
            >
              <EnterIcon />
              Entrar
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
