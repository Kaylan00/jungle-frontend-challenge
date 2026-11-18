import { X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { use, useRef } from 'react'
import { Dialog, DialogClose, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog'
import { HomePage } from '@/features/catalog/home-page'
import { DecorativeCopy } from '@/lib/decorative'
import { cn } from '@/lib/utils'
import { AuthReturnFocus } from './auth-overlay'
import { isTouchLayout } from './auth-ui'

/**
 * Moldura comum das telas de conta (entrar, criar conta, recuperar e redefinir senha).
 * Desktop: janela sobre a página de origem (ou a inicial), como no Figma. Mobile: tela cheia com rolagem própria.
 * É um Dialog do Radix: prende o foco, fecha com Esc e devolve o foco ao sair.
 */

/**
 * Página inicial ao fundo (só desktop) quando a tela de conta é aberta pela rota direta (/login digitado,
 * refresh, origem privada). Vindo de uma página pública, o fundo é a própria página (auth-overlay.ts).
 * Só visual: inerte (sem foco nem clique) e fora da árvore de acessibilidade.
 */
export function AuthBackdrop() {
  return (
    <div aria-hidden="true" inert className="pointer-events-none hidden md:block">
      <DecorativeCopy value>
        <HomePage search={{}} />
      </DecorativeCopy>
    </div>
  )
}

/**
 * Título da tela de conta. Aberta pela rota direta (/login, /cadastro, /recuperar-senha...), a janela é a
 * página: o título é o h1 dela (a página inicial ao fundo é só decorativa). Aberta sobre outra página, que já
 * tem o seu h1, o título é h2.
 */
export function AuthTitle({ standalone, className, children }: { standalone: boolean; className?: string; children: React.ReactNode }) {
  const Heading = standalone ? 'h1' : 'h2'
  return (
    <DialogTitle asChild className={className}>
      <Heading>{children}</Heading>
    </DialogTitle>
  )
}

export function AuthDialog({
  onClose,
  initialFocusId,
  className,
  closeClassName,
  children,
}: {
  onClose: () => void
  /** Campo focado ao abrir no desktop. Sem ele (ou em tela de toque), o foco vai para a própria janela. */
  initialFocusId?: string
  className?: string
  closeClassName?: string
  children: React.ReactNode
}) {
  const contentRef = useRef<HTMLDivElement>(null)
  const returnFocus = use(AuthReturnFocus)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogPortal>
        {/* Desvio consciente do Figma (que não escurece o fundo): no desktop a página inicial fica atrás de um
            véu escuro com leve desfoque, para dar foco e contraste à janela. Entra com fade (index.css,
            [data-slot='dialog-overlay']). No mobile a janela é tela cheia: o véu não aparece. */}
        <DialogOverlay className="bg-black/[0.58] backdrop-blur-[2px] max-md:bg-transparent max-md:backdrop-blur-none" />
        <DialogPrimitive.Content
          ref={contentRef}
          data-slot="dialog-content"
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex w-[500px] max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col bg-[#241612] text-foreground outline-none',
            'border-b-[10px] border-[#d28a4c]',
            // Mobile (Figma 414): tela cheia, sem a faixa laranja, com rolagem própria.
            'max-md:inset-0 max-md:h-dvh max-md:w-auto max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:overflow-y-auto max-md:overscroll-contain max-md:rounded-none max-md:border-b-0 max-md:bg-background',
            className,
          )}
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            const field = initialFocusId && !isTouchLayout() ? document.getElementById(initialFocusId) : null
            // Sem campo: a própria janela recebe o foco (fica preso nela e o leitor de tela anuncia o título).
            ;(field ?? contentRef.current)?.focus({ preventScroll: true })
          }}
          onCloseAutoFocus={(e) => {
            // Janela sobre a página de origem: o foco volta para quem a abriu ou, se ele saiu da tela (ex.: o
            // "Entrar" do cabeçalho depois do login), para o conteúdo principal. Trocando de tela dentro da
            // janela, a página continua inerte e o foco fica na janela nova.
            if (!returnFocus) return
            e.preventDefault()
            const target = returnFocus.isConnected ? returnFocus : document.getElementById('conteudo')
            if (target && !target.closest('[inert]')) target.focus({ preventScroll: true })
          }}
        >
          {/* Faixa de altura zero e "sticky" no topo da área que rola: o X fica sempre visível, mesmo com o
              conteúdo rolado (mobile em tela cheia ou janela que precisou rolar numa tela baixa).
              Desktop: o X fica no canto da janela, como no Figma. */}
          <div className="sticky top-0 z-10 h-0 max-md:pointer-events-none max-md:flex max-md:justify-end">
            <DialogClose
              data-testid="auth-close"
              className={cn(
                'absolute right-[9px] top-[9px] grid size-6 place-items-center rounded-sm text-[#d28a4c] hover:text-[#e89b55] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'max-md:pointer-events-auto max-md:relative max-md:right-auto max-md:top-auto max-md:mr-2 max-md:mt-2 max-md:size-11 max-md:shrink-0 max-md:rounded-full max-md:bg-background/85 max-md:backdrop-blur-sm',
                closeClassName,
              )}
            >
              <X className="size-[22px]" strokeWidth={1.5} aria-hidden="true" />
              <span className="sr-only">Fechar</span>
            </DialogClose>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}

/** Cabeçalho das telas de conta no mobile: marca grande (o título acessível é o DialogTitle). */
export function AuthMobileBrand() {
  return (
    <p aria-hidden="true" className="text-center text-[32px] font-bold leading-[44px] tracking-[0.11em] md:hidden">
      KURIO
    </p>
  )
}
