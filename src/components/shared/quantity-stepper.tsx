import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Seletor de quantidade inteira entre min e max, com botões e rótulo acessível. */
export function QuantityStepper({
  value,
  min = 1,
  max,
  onChange,
  label,
  disabled,
  className,
}: {
  value: number
  min?: number
  max: number
  onChange: (v: number) => void
  label: string
  disabled?: boolean
  className?: string
}) {
  const btn = 'grid size-6 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-35'
  return (
    <div role="group" aria-label={label} className={cn('inline-flex items-center gap-3', className)}>
      <button type="button" className={btn} onClick={() => onChange(value - 1)} disabled={disabled || value <= min} aria-label={`Diminuir ${label.toLowerCase()}`}>
        <Minus className="size-3.5" aria-hidden="true" />
      </button>
      <output aria-live="polite" aria-label={`${label}: ${value}`} className="min-w-4 text-center tabular-nums" data-testid="quantity-value">
        {value}
      </output>
      <button type="button" className={btn} onClick={() => onChange(value + 1)} disabled={disabled || value >= max} aria-label={`Aumentar ${label.toLowerCase()}`}>
        <Plus className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}
