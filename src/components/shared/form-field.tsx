import { Eye, EyeOff } from 'lucide-react'
import { forwardRef, useId, useState } from 'react'
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { cn } from '@/lib/utils'

/**
 * Campo de formulário acessível: label ligado ao input, erro ligado via aria-describedby,
 * aria-invalid quando há erro, asterisco de obrigatório com texto para leitor de tela.
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
  }
>(function FormField({ label, error, hint, hideLabel, prefix, required, className, containerClassName, type, id: idProp, ...props }, ref) {
  const autoId = useId()
  const id = idProp ?? autoId
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const [show, setShow] = useState(false)
  const isPassword = type === 'password'
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined

  return (
    <div className={cn('flex flex-col gap-1.5', containerClassName)}>
      <label htmlFor={id} className={cn('text-[13px] font-medium', hideLabel && 'sr-only')}>
        {label}
        {required && (
          <span className="ml-0.5 text-primary" aria-hidden="true">
            *
          </span>
        )}
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
            'h-10 w-full min-w-0 rounded-md border border-input bg-card px-3 text-[13px] text-foreground placeholder:text-subtle-foreground',
            'focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
            'aria-[invalid=true]:border-destructive',
            isPassword && 'pr-10',
            className,
          )}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded text-primary hover:bg-secondary"
            aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
            aria-pressed={show}
          >
            {show ? <Eye className="size-4" aria-hidden="true" /> : <EyeOff className="size-4" aria-hidden="true" />}
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

/** Aplica no react-hook-form os erros por campo devolvidos pela API (ex.: e-mail já cadastrado). */
export function applyApiFieldErrors<T extends FieldValues>(fields: Record<string, string>, setError: UseFormSetError<T>, allowed: ReadonlyArray<Path<T>>) {
  let first = true
  for (const [name, message] of Object.entries(fields)) {
    if (!allowed.includes(name as Path<T>)) continue
    setError(name as Path<T>, { type: 'server', message }, { shouldFocus: first })
    first = false
  }
  return !first
}
