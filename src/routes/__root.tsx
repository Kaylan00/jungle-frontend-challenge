import { createRootRouteWithContext, Outlet, useRouterState } from '@tanstack/react-router'
import { lazy, Suspense, useEffect, useRef } from 'react'
import { Toaster } from 'sonner'
import type { RouterContext } from '@/app/router'
import { Footer } from '@/components/layout/footer'
import { Header } from '@/components/layout/header'
import { LiveAnnouncer } from '@/components/layout/live-announcer'
import { MobileNav } from '@/components/layout/mobile-nav'
import { RealtimeBadge } from '@/components/layout/realtime-badge'

// Painel de cenários só existe com mocks ligados (não entra no bundle sem eles).
const ScenarioPanel = import.meta.env.VITE_ENABLE_MOCKS === 'true' ? lazy(() => import('@/mocks/scenario-panel')) : null

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
})

function RootLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const mainRef = useRef<HTMLElement>(null)
  const first = useRef(true)

  // Troca de página: foco vai para o conteúdo principal (leitor de tela anuncia a nova página).
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    mainRef.current?.focus({ preventScroll: true })
  }, [pathname])

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Pular para o conteúdo
      </a>
      <Header />
      <main id="conteudo" ref={mainRef} tabIndex={-1} className="min-h-dvh flex-1 pb-24 outline-none md:pb-0">
        <Outlet />
      </main>
      <Footer />
      <MobileNav />
      <RealtimeBadge />
      <LiveAnnouncer />
      <Toaster
        theme="dark"
        position="top-center"
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
