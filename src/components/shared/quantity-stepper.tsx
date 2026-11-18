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
  /** sm: círculos pequenos (carrinho). lg: pílulas verticais do detalhe no desktop. pill: pílulas de 19x28 da barra de compra mobile (Figma). */
  size?: 'sm' | 'lg' | 'pill'
  className?: string
}) {
  const lg = size === 'lg'
  const pill = size === 'pill'
  const btn = cn(
    'grid place-items-center rounded-full bg-primary text-primary-foreground transition-[opacity,background-color,filter,scale] duration-200 enabled:hover:brightness-110 disabled:opacity-35',
    lg
      ? 'h-[49.5px] w-[33px] border border-[#140d0a] text-[#020101] shadow-[0_6.6px_19.8px_-3.3px_rgba(20,13,10,0.149)]'
      : pill
        ? 'h-7 w-[19px] text-black'
        : 'size-6 max-md:border max-md:border-[#3f2319] max-md:bg-[#2f1d15] max-md:text-foreground max-md:disabled:text-[#55321f] max-md:disabled:opacity-100 md:h-7 md:w-[19px] md:text-black',
  )
  const icon = lg ? 'size-[26.4px]' : pill ? 'size-3.5 stroke-[3.4]' : 'size-3.5 max-md:size-4 max-md:stroke-[2.4] md:stroke-[3.4]'
  const stroke = lg ? 1.85 : 2
  return (
    <div role="group" aria-label={label} className={cn('inline-flex items-center', lg ? 'gap-3' : pill ? 'gap-0' : 'gap-2 md:gap-0', className)}>
      <button type="button" className={btn} onClick={() => onChange(value - 1)} disabled={disabled || value <= min} aria-label={`Diminuir ${label.toLowerCase()}`}>
        <Minus className={icon} strokeWidth={stroke} aria-hidden="true" />
      </button>
      <output
        aria-live="polite"
        aria-label={`${label}: ${value}`}
        className={cn(
          'text-center tabular-nums',
          lg ? 'min-w-[13px] text-[20px] font-normal leading-[28px]' : pill ? 'w-9 text-[18px] text-foreground' : 'min-w-[17px] max-md:text-[16px] md:w-9 md:text-[16px] md:font-light',
        )}
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
