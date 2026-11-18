/**
 * A CASCA do Kurio Admin: mesa escura, trilho solto à esquerda e a lousa arredondada onde o trabalho acontece.
 * Sem barra de topo: o trilho diz onde se está e cada seção traz o próprio título e as próprias ações.
 *
 * - Landmarks: <nav> do trilho, <main id="conteudo"> na lousa (o "Pular para o conteúdo" leva até ela).
 * - Busca global: Ctrl+K ou Ctrl+F (⌘ no Mac) em qualquer tela do painel; o Ctrl+F do navegador dá lugar à
 *   busca do painel, que procura no painel inteiro e não só no texto visível.
 * - Celular (< 768px): o trilho vira um menu que abre por cima (diálogo com foco preso, Esc fecha).
 * - Troca de seção: o foco vai para a lousa (o leitor de tela anuncia a área nova) e ela sobe para o topo.
 */
import { Outlet, useRouterState } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { useAdminLogout } from '../hooks'
import { CommandPalette } from './command-palette'
import './panel.css'
import { RailContent } from './rail'
import { PanelShellContext } from './shell-context'

const RAIL_KEY = 'kurio.admin.trilho'

function readRailPreference(): boolean | null {
  try {
    const v = localStorage.getItem(RAIL_KEY)
    return v === null ? null : v === 'recolhido'
  } catch {
    return null
  }
}

/** Recolhido por escolha gravada; sem escolha, recolhido na faixa entre tablet e notebook (768–1199px). */
function useRailCollapsed() {
  const [collapsed, setCollapsed] = useState(() => readRailPreference() ?? window.matchMedia('(min-width: 768px) and (max-width: 1199px)').matches)
  useEffect(() => {
    if (readRailPreference() !== null) return
    const mid = window.matchMedia('(min-width: 768px) and (max-width: 1199px)')
    const sync = () => readRailPreference() === null && setCollapsed(mid.matches)
    mid.addEventListener('change', sync)
    return () => mid.removeEventListener('change', sync)
  }, [])
  const toggle = useCallback(() => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(RAIL_KEY, c ? 'aberto' : 'recolhido')
      } catch {
        /* sem storage: vale só nesta visita */
      }
      return !c
    })
  }, [])
  return [collapsed, toggle] as const
}

export function PanelShell() {
  const [collapsed, toggleRail] = useRailCollapsed()
  const [searchOpen, setSearchOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const logout = useAdminLogout()
  const pathname = useRouterState({ select: (s) => (s.resolvedLocation ?? s.location).pathname })
  const mainRef = useRef<HTMLElement>(null)
  const lastPath = useRef(pathname)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || !(e.ctrlKey || e.metaKey)) return
      const key = e.key.toLowerCase()
      if (key !== 'k' && key !== 'f') return
      e.preventDefault()
      setMenuOpen(false)
      setSearchOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (lastPath.current === pathname) return
    lastPath.current = pathname
    setMenuOpen(false)
    mainRef.current?.scrollTo({ top: 0 })
    mainRef.current?.focus({ preventScroll: true })
  }, [pathname])

  // Sair encerra a sessão; quem leva para a entrada do painel é o SessionSync (vale também para sair em outra aba).
  const signOut = useCallback(() => logout.mutate(), [logout])

  const api = useMemo(() => ({ openSearch: () => setSearchOpen(true), openMenu: () => setMenuOpen(true) }), [])

  return (
    <PanelShellContext.Provider value={api}>
      <div className="kpanel flex h-dvh overflow-hidden md:gap-3 md:p-3 md:pl-0" data-testid="panel-shell">
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          Pular para o conteúdo
        </a>

        <aside
          id="kp-trilho"
          aria-label="Menu do painel"
          className={cn('hidden shrink-0 transition-[width] duration-200 ease-out md:block', collapsed ? 'w-[76px]' : 'w-[256px]')}
          data-collapsed={collapsed || undefined}
        >
          <RailContent collapsed={collapsed} onToggle={toggleRail} onSearch={() => setSearchOpen(true)} onLogout={signOut} loggingOut={logout.isPending} />
        </aside>

        <main
          id="conteudo"
          ref={mainRef}
          tabIndex={-1}
          className="kp-lousa relative min-w-0 flex-1 overflow-y-auto overscroll-contain outline-none max-md:border-0 md:rounded-[20px]"
        >
          <Outlet />
        </main>
      </div>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="kpanel w-[min(300px,86vw)] gap-0 border-r border-[var(--kp-linha)] bg-[var(--kp-mesa)] p-0 sm:max-w-[300px]" data-testid="panel-mobile-menu">
          <SheetTitle className="sr-only">Menu do painel</SheetTitle>
          <SheetDescription className="sr-only">Áreas do Kurio Admin, busca, loja e conta.</SheetDescription>
          <RailContent
            onSearch={() => {
              setMenuOpen(false)
              setSearchOpen(true)
            }}
            onLogout={signOut}
            loggingOut={logout.isPending}
            onNavigate={() => setMenuOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </PanelShellContext.Provider>
  )
}
