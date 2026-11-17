import { cn } from '@/lib/utils'

/**
 * Skeleton com shimmer (brilho que atravessa o bloco).
 * - Ocupa exatamente o espaço do conteúdo final (quem usa define largura/altura): sem pulo de layout.
 * - aria-hidden: o leitor de tela recebe o aviso de carregamento pelo container (aria-busy).
 * - Com prefers-reduced-motion o brilho para (regra global em index.css).
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn(
        'relative overflow-hidden rounded-md bg-secondary',
        'before:absolute before:inset-0 before:-translate-x-full before:animate-shimmer',
        'before:bg-gradient-to-r before:from-transparent before:via-white/[0.06] before:to-transparent',
        className,
      )}
      {...props}
    />
  )
}

export { Skeleton }
