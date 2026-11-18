/**
 * Uma seção na lousa: cabeçalho com o título (h1), a frase da seção e as ações dela, e o conteúdo embaixo.
 * No celular o cabeçalho também traz o botão do menu e o da busca (o trilho não está ao lado).
 * O conteúdo entra com um movimento curto (CSS); com "reduzir movimento" ele só aparece.
 */
import { Menu, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LiveStatus } from './live-status'
import { usePanelShell } from './shell-context'

export function PanelPage({
  title,
  eyebrow,
  description,
  actions,
  children,
  className,
}: {
  title: string
  eyebrow?: string
  description?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  const shell = usePanelShell()
  return (
    <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-6 px-4 pb-12 pt-4 sm:px-6 md:px-8 md:pt-7 min-[1800px]:px-12">
      <div className="flex items-center justify-between gap-2 md:hidden">
        <button
          type="button"
          onClick={shell.openMenu}
          className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-[var(--kp-linha)] px-3 text-[13px] font-semibold"
          aria-haspopup="dialog"
        >
          <Menu className="size-[18px]" aria-hidden="true" />
          Menu
        </button>
        <span className="text-[12px] font-bold tracking-[0.18em]" aria-hidden="true">
          KURIO <span className="text-[var(--kp-laranja-texto)]">ADMIN</span>
        </span>
        <button
          type="button"
          onClick={shell.openSearch}
          className="grid size-10 place-items-center rounded-[10px] border border-[var(--kp-linha)]"
          aria-label="Buscar no painel"
        >
          <Search className="size-[18px]" aria-hidden="true" />
        </button>
      </div>

      <header className="flex flex-col gap-4 border-b border-[var(--kp-linha)] pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          {eyebrow && <p className="kp-rotulo mb-2">{eyebrow}</p>}
          <h1 className="text-[24px] font-bold leading-tight tracking-[-0.01em] md:text-[28px]">{title}</h1>
          {description && <p className="mt-1.5 max-w-2xl text-[13.5px] leading-5 text-[var(--kp-grafite)]">{description}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          <LiveStatus />
        </div>
      </header>

      <div className={cn('kp-entra flex flex-col gap-6', className)}>{children}</div>
    </div>
  )
}
