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
  size = 'sm',
  className,
}: {
  value: number
  min?: number
  max: number
  onChange: (v: number) => void
  label: string
  disabled?: boolean
  /** sm: círculos pequenos (carrinho, barra mobile). lg: pílulas verticais do detalhe no desktop (Figma). */
  size?: 'sm' | 'lg'
  className?: string
}) {
  const lg = size === 'lg'
  const btn = cn(
    'grid place-items-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-35',
    lg ? 'h-12 w-[31px] text-[#020101]' : 'size-6 md:h-7 md:w-[19px] md:text-black',
  )
  const icon = lg ? 'size-[26px]' : 'size-3.5 md:stroke-[3.4]'
  const stroke = lg ? 1.85 : 2
  return (
    <div role="group" aria-label={label} className={cn('inline-flex items-center', lg ? 'gap-0' : 'gap-3 md:gap-0', className)}>
      <button type="button" className={btn} onClick={() => onChange(value - 1)} disabled={disabled || value <= min} aria-label={`Diminuir ${label.toLowerCase()}`}>
        <Minus className={icon} strokeWidth={stroke} aria-hidden="true" />
      </button>
      <output
        aria-live="polite"
        aria-label={`${label}: ${value}`}
        className={cn('text-center tabular-nums', lg ? 'w-[39px] text-[20px] font-light leading-none' : 'min-w-4 md:w-9 md:text-[16px] md:font-light')}
        data-testid="quantity-value"
      >
        {value}
      </output>
      <button type="button" className={btn} onClick={() => onChange(value + 1)} disabled={disabled || value >= max} aria-label={`Aumentar ${label.toLowerCase()}`}>
        <Plus className={icon} strokeWidth={stroke} aria-hidden="true" />
      </button>
    </div>
  )
}
