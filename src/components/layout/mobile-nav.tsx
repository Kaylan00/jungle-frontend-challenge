import { Link, useRouterState } from '@tanstack/react-router'
import { useCartCount } from '@/features/cart/hooks'
import { useBottomBar } from '@/lib/bottom-bars'
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
  // Carrinho cheio, como os outros ícones da barra no Figma (alça em traço, cesto preenchido, rodas).
  return (
    <svg viewBox="0 0 22 20" width="22" height="20" fill="none" aria-hidden="true">
      <path d="M1 1.4h2.1c.45 0 .84.31.93.75L6 12.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 4h15.3c.66 0 1.13.64.94 1.27l-1.95 6.5A1.7 1.7 0 0 1 17.16 13H7.1a1.7 1.7 0 0 1-1.66-1.34z" fill="currentColor" />
      <circle cx="8.2" cy="17.1" r="1.6" fill="currentColor" />
      <circle cx="16.4" cy="17.1" r="1.6" fill="currentColor" />
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

/* Ícone "Scan" do Figma (Iconly Curved, 26.82 x 24): cantos curvos e linha do meio de ponta a ponta. */
function ScanIcon() {
  return (
    <svg viewBox="0 0 27 24" width="26.82" height="24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
      <path d="M9.6 1.3H7.4C3.2 1.3 1.5 3 1.5 7.2v1.3" />
      <path d="M17.4 1.3h2.2c4.2 0 5.9 1.7 5.9 5.9v1.3" />
      <path d="M9.6 22.7H7.4c-4.2 0-5.9-1.7-5.9-5.9v-1.3" />
      <path d="M17.4 22.7h2.2c4.2 0 5.9-1.7 5.9-5.9v-1.3" />
      <path d="M.95 12h25.1" />
    </svg>
  )
}

/*
 * Peça central da barra com o recorte do Figma: círculo de raio 50 com centro 5px abaixo da borda
 * superior, ligado à borda por curvas de transição (raio 10) em vez de quinas. A peça fica entre
 * duas metades com cantos de 40px; o caminho passa 1px de cada lado para não abrir fresta.
 */
const NOTCH = { w: 140, cx: 70, R: 50, cy: 5, r: 10 }
const notchPath = (() => {
  const { w, cx, R, cy, r } = NOTCH
  const d = Math.sqrt((R + r) ** 2 - (r - cy) ** 2)
  const k = R / (R + r)
  const tx = d * k
  const ty = cy + (r - cy) * k
  const f = (n: number) => n.toFixed(2)
  return [
    `M-1 0H${f(cx - d)}`,
    `A${r} ${r} 0 0 1 ${f(cx - tx)} ${f(ty)}`,
    `A${R} ${R} 0 0 0 ${f(cx + tx)} ${f(ty)}`,
    `A${r} ${r} 0 0 1 ${f(cx + d)} 0`,
    `H${w + 1}V96H-1Z`,
  ].join('')
})()

function NotchPiece() {
  return (
    <svg width={NOTCH.w} height="96" viewBox={`0 0 ${NOTCH.w} 96`} className="shrink-0 overflow-visible text-card" aria-hidden="true">
      <path d={notchPath} fill="currentColor" />
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
  // O botão central sai 25px para cima da barra: os avisos ficam acima dele.
  const barRef = useBottomBar({ extra: 25 })
  if (!hasMobileNav(pathname)) return null
  const active = pathname === '/' ? 'home' : pathname === '/perfil/favoritos' ? 'favorites' : pathname.startsWith('/perfil') ? 'profile' : null
  const item = (on: boolean) =>
    cn(
      'absolute top-[34px] grid size-11 -translate-x-1/2 place-items-center rounded-full text-muted-foreground transition-[color,scale] duration-200 hover:text-highlight active:scale-90',
      on && 'text-highlight',
    )
  return (
    <nav ref={barRef} aria-label="Navegação inferior" className="fixed inset-x-0 bottom-0 z-40 h-24 md:hidden">
      <div aria-hidden="true" className="absolute inset-0 flex drop-shadow-[0_-8px_24px_rgba(0,0,0,0.25)]">
        <div className="flex-1 rounded-tl-[40px] bg-card" />
        <NotchPiece />
        <div className="flex-1 rounded-tr-[40px] bg-card" />
      </div>
      <Link to="/" className={cn(item(active === 'home'), 'left-[calc(50%-161px)]')} aria-label="Início" aria-current={active === 'home' ? 'page' : undefined}>
        <HomeIcon />
      </Link>
      <Link
        to="/perfil/favoritos"
        className={cn(item(active === 'favorites'), 'left-[calc(50%-89px)]')}
        aria-label="Favoritos"
        aria-current={active === 'favorites' ? 'page' : undefined}
      >
        <HeartIcon />
      </Link>
      <Link
        to="/"
        hash="catalogo"
        className="absolute -top-[25px] left-1/2 grid size-16 -translate-x-1/2 place-items-center rounded-full bg-[linear-gradient(180deg,rgba(210,138,76,0.45),rgba(210,138,76,0.95))] text-foreground transition-[filter,scale] duration-200 hover:brightness-115 active:scale-90"
        aria-label="Explorar catálogo"
      >
        <ScanIcon />
      </Link>
      <Link
        to="/carrinho"
        className={cn(item(false), 'left-[calc(50%+95px)]')}
        aria-label={`Carrinho, ${count} ${count === 1 ? 'item' : 'itens'}`}
      >
        <CartIcon />
        {count > 0 && (
          <span className="absolute right-0 top-0.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold leading-4 text-primary-foreground" data-bump="cart">
            {count}
          </span>
        )}
      </Link>
      <Link
        to="/perfil"
        className={cn(item(active === 'profile'), 'left-[calc(50%+157px)]')}
        aria-label="Perfil"
        aria-current={active === 'profile' ? 'page' : undefined}
      >
        <UserIcon />
      </Link>
    </nav>
  )
}

