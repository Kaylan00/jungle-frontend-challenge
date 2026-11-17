/**
 * Aritmética de ETH sem perda de precisão.
 *
 * `0.1 + 0.2` em number dá `0.30000000000000004`. Para dinheiro isso é inaceitável,
 * então todo valor ETH é string decimal e as contas passam por decimal.js.
 * O mesmo módulo é usado pelos mocks (servidor simulado) e pela interface.
 */
import Decimal from 'decimal.js'

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP })

export const ETH_DECIMALS = 18

/** Normaliza para string decimal sem notação científica e sem zeros à direita. */
export function toEthString(value: Decimal.Value): string {
  const d = new Decimal(value).toDecimalPlaces(ETH_DECIMALS, Decimal.ROUND_DOWN)
  return d.toFixed()
}

export function addEth(...values: Decimal.Value[]): string {
  return toEthString(values.reduce<Decimal>((acc, v) => acc.plus(v), new Decimal(0)))
}

export function mulEth(value: Decimal.Value, factor: Decimal.Value): string {
  return toEthString(new Decimal(value).times(factor))
}

export function subEth(a: Decimal.Value, b: Decimal.Value): string {
  return toEthString(Decimal.max(new Decimal(a).minus(b), 0))
}

/** Percentual de desconto aplicado sobre um valor, arredondado para baixo (nunca dá desconto a mais). */
export function percentOf(value: Decimal.Value, percent: Decimal.Value): string {
  return toEthString(new Decimal(value).times(percent).dividedBy(100))
}

export function compareEth(a: Decimal.Value, b: Decimal.Value): number {
  return new Decimal(a).comparedTo(b)
}

export function isZero(value: Decimal.Value): boolean {
  return new Decimal(value).isZero()
}

/**
 * Formata para exibição: até 4 casas, sem arredondar para cima.
 * O valor completo continua disponível no title/aria quando necessário.
 */
export function formatEth(value: Decimal.Value, opts: { maxDecimals?: number; withUnit?: boolean } = {}) {
  const { maxDecimals = 4, withUnit = true } = opts
  const d = new Decimal(value)
  const fixed = d.toDecimalPlaces(maxDecimals, Decimal.ROUND_DOWN)
  const [int, frac = ''] = fixed.toFixed(Math.max(2, Math.min(maxDecimals, fixed.decimalPlaces()))).split('.')
  // Convenção de cripto (e do Figma): ponto como separador decimal, ex.: "1.19 ETH".
  const intFmt = Number(int).toLocaleString('en-US')
  const text = frac ? `${intFmt}.${frac}` : intFmt
  return withUnit ? `${text} ETH` : text
}

/** Cotação fixa ETH→BRL usada apenas como referência visual (dado simulado). */
export const ETH_TO_BRL = '18450.32'

export function formatBrl(eth: Decimal.Value) {
  const brl = new Decimal(eth).times(ETH_TO_BRL).toDecimalPlaces(2).toNumber()
  return brl.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
