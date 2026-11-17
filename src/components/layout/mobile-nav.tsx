import { Link, useRouterState } from '@tanstack/react-router'
import { ScanLine } from 'lucide-react'
import { useCartCount } from '@/features/cart/hooks'
import { cn } from '@/lib/utils'
import { hasMobileNav } from './mobile-nav-routes'

/* Ícones cheios do Figma mobile (casa, coração, carrinho e pessoa). */
function HomeIcon() {
  return (
    <svg viewBox="0 0 16 18" width="16" height="18" fill="currentColor" aria-hidden="true">
      <path d="M8 .6 0 7.4V17a1 1 0 0 0 1 1h4.6v-5.6h4.8V18H15a1 1 0 0 0 1-1V7.4z" />
    </svg>
  )
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 20 18" width="20" height="18" fill="currentColor" aria-hidden="true">
      <path d="M10 18 8.6 16.7C3.4 12 0 8.9 0 5.2 0 2.2 2.4 0 5.4 0 7.1 0 8.8.8 10 2.1 11.2.8 12.9 0 14.6 0c3 0 5.4 2.2 5.4 5.2 0 3.7-3.4 6.8-8.6 11.5z" />
    </svg>
  )
}

function CartIcon() {
  return (
    <svg viewBox="0 0 20 18" width="20" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M.8 1h2.4l2.2 10.2h10.8l2.2-7.4H4" />
      <circle cx="7" cy="15.6" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="15" cy="15.6" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  )
}

function UserIcon() {
  return (
    <svg viewBox="0 0 14 18" width="14" height="18" fill="currentColor" aria-hidden="true">
      <circle cx="7" cy="4.2" r="4" />
      <path d="M0 16c0-3.6 3.1-6 7-6s7 2.4 7 6v1a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1z" />
    </svg>
  )
}

/**
 * Barra inferior do layout mobile (Figma 414: barra de 96px com cantos de 40px e um recorte em volta do
 * botão central redondo; início, favoritos, botão central, carrinho e perfil).
 */
export function MobileNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const count = useCartCount()
  if (!hasMobileNav(pathname)) return null
  const item = (active: boolean) =>
    cn('absolute top-[34px] grid size-11 -translate-x-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:text-highlight', active && 'text-highlight')
  return (
    <nav aria-label="Navegação inferior" className="fixed inset-x-0 bottom-0 z-40 h-24 md:hidden">
      <div
        aria-hidden="true"
        className="absolute inset-0 rounded-t-[40px] bg-card shadow-[0_-8px_24px_rgba(0,0,0,0.25)] [mask-image:radial-gradient(circle_at_50%_7px,transparent_43px,#000_44px)]"
      />
      <Link to="/" className={cn(item(pathname === '/'), 'left-[calc(50%-161px)]')} aria-label="Início" aria-current={pathname === '/' ? 'page' : undefined}>
        <HomeIcon />
      </Link>
      <Link to="/perfil/favoritos" className={cn(item(pathname === '/perfil/favoritos'), 'left-[calc(50%-89px)]')} aria-label="Favoritos">
        <HeartIcon />
      </Link>
      <Link
        to="/"
        hash="catalogo"
        className="absolute -top-[25px] left-1/2 grid size-16 -translate-x-1/2 place-items-center rounded-full bg-[linear-gradient(180deg,#70492a,#c78349)] text-foreground transition-[filter] hover:brightness-110"
        aria-label="Explorar catálogo"
      >
        <ScanLine className="size-[27px]" strokeWidth={1.8} aria-hidden="true" />
      </Link>
      <Link
        to="/carrinho"
        className={cn(item(pathname === '/carrinho'), 'left-[calc(50%+95px)]')}
        aria-label={`Carrinho, ${count} ${count === 1 ? 'item' : 'itens'}`}
      >
        <CartIcon />
        {count > 0 && (
          <span className="absolute right-0 top-0.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold leading-4 text-primary-foreground">
            {count}
          </span>
        )}
      </Link>
      <Link
        to="/perfil"
        className={cn(item(pathname.startsWith('/perfil') && pathname !== '/perfil/favoritos'), 'left-[calc(50%+157px)]')}
        aria-label="Perfil"
      >
        <UserIcon />
      </Link>
    </nav>
  )
}
