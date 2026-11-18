import { createRootRouteWithContext, Outlet, useRouterState } from '@tanstack/react-router'
import { lazy, Suspense, useEffect, useRef } from 'react'
import { Toaster } from 'sonner'
import type { RouterContext } from '@/app/router'
import { Footer } from '@/components/layout/footer'
import { Header } from '@/components/layout/header'
import { LiveAnnouncer } from '@/components/layout/live-announcer'
import { MobileNav } from '@/components/layout/mobile-nav'
import { MotionBoot } from '@/components/layout/motion-boot'
import { hasMobileNav } from '@/components/layout/mobile-nav-routes'
import { RealtimeBadge } from '@/components/layout/realtime-badge'
import { useAuthOverlay } from '@/features/auth/auth-overlay'
import { AuthOverlayHost } from '@/features/auth/auth-overlay-host'
import { PriceDropNotifier } from '@/features/favorites/price-drop-notifier'
import { isPanelPath } from '@/features/admin/panel-path'
import { refreshBottomBars } from '@/lib/bottom-bars'
import { useIsDesktop } from '@/lib/use-media-query'
import { cn } from '@/lib/utils'

// Painel de cenários só existe com mocks ligados (não entra no bundle sem eles).
const ScenarioPanel = import.meta.env.VITE_ENABLE_MOCKS === 'true' ? lazy(() => import('@/mocks/scenario-panel')) : null

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
})

/**
 * Avisos (sonner). Desktop: canto inferior direito, acima do indicador de tempo real. Mobile: embaixo, acima
 * da barra fixa da página (navegação inferior, barra de compra ou botão de pagamento: --bottom-bars, medido
 * em lib/bottom-bars.ts), sem cobrir o cabeçalho, o voltar nem botões fixos. Respeita a área segura.
 * Abaixo de 600px o sonner usa `mobileOffset` e ocupa a largura toda.
 */
const TOAST_OFFSET = {
  bottom: 'max(calc(var(--bottom-bars, 0px) + 12px), calc(env(safe-area-inset-bottom, 0px) + 56px))',
  right: 'calc(env(safe-area-inset-right, 0px) + 16px)',
}
const TOAST_MOBILE_OFFSET = {
  bottom: 'calc(max(var(--bottom-bars, 0px), env(safe-area-inset-bottom, 0px)) + 12px)',
  left: 'calc(env(safe-area-inset-left, 0px) + 12px)',
  right: 'calc(env(safe-area-inset-right, 0px) + 12px)',
}

/**
 * Duas aplicações no mesmo origin: a loja e o Kurio Admin (/admin/*). O painel não usa cabeçalho, rodapé,
 * barra inferior, login por cima da página, alerta de preço dos favoritos nem a aba de cenários da loja: a
 * casca dele mora em routes/admin/_painel.tsx. A escolha segue a página já exibida (e não a que está
 * carregando), para a loja não ficar sem moldura no meio da navegação até o painel.
 */
function RootLayout() {
  const shownPathname = useRouterState({ select: (s) => (s.resolvedLocation ?? s.location).pathname })
  return isPanelPath(shownPathname) ? <PanelRoot /> : <StoreLayout />
}

/** Raiz do painel: só a página, as regiões de anúncio (aria-live) e os avisos. */
function PanelRoot() {
  return (
    <>
      <Outlet />
      <LiveAnnouncer />
      <Toaster
        theme="dark"
        position="bottom-right"
        offset={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)', right: 'calc(env(safe-area-inset-right, 0px) + 16px)' }}
        mobileOffset={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)', left: '12px', right: '12px' }}
        richColors
        toastOptions={{ style: { fontFamily: 'var(--font-sans)', background: '#1b120e', border: '1px solid #442c1b' } }}
      />
    </>
  )
}

function StoreLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  // Tela de conta aberta sobre esta página (ver features/auth/auth-overlay.ts): a página fica ao fundo, inerte.
  const authOverlay = useAuthOverlay()
  const overlayOpen = authOverlay !== null
  // Cabeçalho e rodapé só existem no desktop e a barra inferior só no mobile (as classes md: continuam como
  // reserva): o layout que não aparece nem é montado, o que deixa a primeira tela do celular mais leve.
  const isDesktop = useIsDesktop()
  // Com a página inerte atrás da tela de conta, as barras dela não empurram mais os avisos.
  useEffect(() => refreshBottomBars(), [overlayOpen])
  // Página já exibida (não a que ainda está carregando): uma navegação que o guard desvia para o login por
  // cima da página atual não chega a trocar de página, e o foco fica em quem abriu a janela.
  const shownPathname = useRouterState({ select: (s) => (s.resolvedLocation ?? s.location).pathname })
  const mainRef = useRef<HTMLElement>(null)
  const lastPathname = useRef(shownPathname)

  // Troca de página: foco vai para o conteúdo principal (leitor de tela anuncia a nova página).
  // Compara com a página anterior (e não "primeira execução"): o StrictMode roda o efeito duas vezes ao montar.
  useEffect(() => {
    if (lastPathname.current === shownPathname) return
    lastPathname.current = shownPathname
    mainRef.current?.focus({ preventScroll: true })
  }, [shownPathname])

  return (
    <div className="flex min-h-dvh flex-col">
      {/* display: contents não muda o layout; `inert` tira a página de fundo do foco e do clique. */}
      <div className="contents" inert={overlayOpen ? true : undefined}>
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          Pular para o conteúdo
        </a>
        {isDesktop && <Header />}
        <main id="conteudo" ref={mainRef} tabIndex={-1} className={cn('scale-frame min-h-dvh flex-1 outline-none', hasMobileNav(pathname) && 'max-md:pb-24')}>
          <Outlet />
        </main>
        {/* Confirmação do pedido: no Figma o recibo ("Thank you") aparece sem o rodapé. */}
        {isDesktop ? !pathname.startsWith('/pedido/') && <Footer /> : <MobileNav />}
        <RealtimeBadge />
      </div>
      {authOverlay && <AuthOverlayHost overlay={authOverlay} />}
      <LiveAnnouncer />
      <PriceDropNotifier />
      <MotionBoot />
      <Toaster
        theme="dark"
        position="bottom-right"
        offset={TOAST_OFFSET}
        mobileOffset={TOAST_MOBILE_OFFSET}
        richColors
        toastOptions={{ style: { fontFamily: 'var(--font-sans)', background: 'var(--card)', border: '1px solid var(--border)' } }}
      />
      {ScenarioPanel && (
        <Suspense fallback={null}>
          <ScenarioPanel />
        </Suspense>
      )}
    </div>
  )
}
