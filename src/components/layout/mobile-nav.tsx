import { Link, useRouterState } from '@tanstack/react-router'
import { Heart, Home, LayoutGrid, ShoppingCart, User } from 'lucide-react'
import { useCartCount } from '@/features/cart/hooks'
import { cn } from '@/lib/utils'

/** Barra inferior do layout mobile (Figma: início, favoritos, botão central, carrinho, perfil). */
export function MobileNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const count = useCartCount()
  // Telas com barra de ação própria no Figma mobile (detalhe, carrinho, pagamento) não mostram a navegação.
  if (/^\/(nft|carrinho|pagamento)/.test(pathname)) return null
  const item = (active: boolean) => cn('flex size-11 flex-col items-center justify-center rounded-full text-foreground/80', active && 'text-primary')
  return (
    <nav aria-label="Navegação inferior" className="fixed inset-x-0 bottom-0 z-40 md:hidden">
      <div className="mx-3 mb-3 flex items-center justify-between rounded-2xl border border-border bg-card px-5 py-2 shadow-lg">
        <Link to="/" className={item(pathname === '/')} aria-label="Início" aria-current={pathname === '/' ? 'page' : undefined}>
          <Home className="size-5" aria-hidden="true" />
        </Link>
        <Link to="/perfil/favoritos" className={item(pathname === '/perfil/favoritos')} aria-label="Favoritos">
          <Heart className="size-5" aria-hidden="true" />
        </Link>
        <Link
          to="/"
          hash="catalogo"
          className="-mt-8 grid size-14 place-items-center rounded-full border-4 border-background bg-primary text-primary-foreground"
          aria-label="Explorar catálogo"
        >
          <LayoutGrid className="size-5" aria-hidden="true" />
        </Link>
        <Link to="/carrinho" className={cn(item(pathname === '/carrinho'), 'relative')} aria-label={`Carrinho, ${count} ${count === 1 ? 'item' : 'itens'}`}>
          <ShoppingCart className="size-5" aria-hidden="true" />
          {count > 0 && (
            <span className="absolute right-0 top-0 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold leading-4 text-primary-foreground">
              {count}
            </span>
          )}
        </Link>
        <Link to="/perfil" className={item(pathname.startsWith('/perfil') && pathname !== '/perfil/favoritos')} aria-label="Perfil">
          <User className="size-5" aria-hidden="true" />
        </Link>
      </div>
    </nav>
  )
}
