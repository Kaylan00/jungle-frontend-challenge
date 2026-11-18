import { forwardRef, useId, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Campo de formulário acessível: label ligado ao input, erro ligado via aria-describedby,
 * aria-invalid quando há erro, asterisco de obrigatório com texto para leitor de tela.
 * Visual do Figma: rótulo 14px regular, asterisco laranja grande, campo de 40px com borda
 * marrom e fundo transparente, texto de 14px.
 */
export const FormField = forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> & {
    label: string
    error?: string
    hint?: string
    hideLabel?: boolean
    prefix?: React.ReactNode
    containerClassName?: string
    /** Classes extras do botão de mostrar/ocultar senha (posição varia entre telas no Figma). */
    toggleClassName?: string
  }
>(function FormField(
  { label, error, hint, hideLabel, prefix, required, className, containerClassName, toggleClassName, type, id: idProp, ...props },
  ref,
) {
  const autoId = useId()
  const id = idProp ?? autoId
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const [show, setShow] = useState(false)
  const isPassword = type === 'password'
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined

  return (
    <div className={cn('flex flex-col gap-2', containerClassName)}>
      <label htmlFor={id} className={cn('text-[14px] leading-4 text-foreground', hideLabel && 'sr-only')}>
        {label}
        {required && <RequiredMark />}
        {required && <span className="sr-only"> (obrigatório)</span>}
      </label>
      <div className="relative flex">
        {prefix}
        <input
          ref={ref}
          id={id}
          type={isPassword && show ? 'text' : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          aria-required={required || undefined}
          className={cn(
            'h-10 w-full min-w-0 rounded-[2px] border border-[var(--campo-borda,#3f2319)] bg-transparent px-3 text-[14px] text-foreground placeholder:text-[var(--campo-dica,#b39463)]',
            'focus-visible:border-primary focus-visible:outline-none',
            'aria-[invalid=true]:border-destructive',
            isPassword && 'pr-11',
            className,
          )}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className={cn(
              'absolute right-2.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded text-[var(--campo-dica,#b39463)] hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              toggleClassName,
            )}
            aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
            aria-pressed={show}
          >
            <EyeIcon off={!show} />
          </button>
        )}
      </div>
      {hint && !error && (
        <p id={hintId} className="text-[12px] text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="flex items-center gap-1 text-[12px] text-destructive" data-testid="field-error">
          <span aria-hidden="true">⚠</span>
          {error}
        </p>
      )}
    </div>
  )
})

/** Asterisco de obrigatório do Figma: laranja-coral e maior que o rótulo, alinhado ao topo das maiúsculas. */
export function RequiredMark({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn('relative top-px ml-px inline-block align-top text-[22px] leading-4 text-[var(--campo-obrigatorio,#f0805f)]', className)}>
      *
    </span>
  )
}

/** Olho do Figma: elipse com pupila; riscado quando a senha está oculta. */
export function EyeIcon({ off = true, className }: { off?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 20 16" width={20} height={16} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true" className={className}>
      <ellipse cx="10" cy="8" rx="9" ry="5.6" />
      <circle cx="10" cy="8" r="2.4" />
      {off && <path d="M2.6 14.6 17.4 1.4" />}
    </svg>
  )
}
