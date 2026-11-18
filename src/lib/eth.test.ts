import { describe, expect, it } from 'vitest'
import { addEth, compareEth, ETH_DECIMALS, formatBrl, formatEth, isZero, mulEth, percentOf, subEth, toEthString } from './eth'

const ONE_WEI = '0.000000000000000001'

describe('toEthString', () => {
  it('normaliza sem zeros à direita e sem notação científica', () => {
    expect(toEthString('1.500')).toBe('1.5')
    expect(toEthString('0010')).toBe('10')
    expect(toEthString(1e-7)).toBe('0.0000001')
    expect(toEthString('1e21')).toBe('1000000000000000000000')
    expect(toEthString(0.1)).toBe('0.1')
  })

  it('mantém exatamente 18 casas e corta (nunca arredonda para cima) o que passa delas', () => {
    expect(ETH_DECIMALS).toBe(18)
    expect(toEthString(ONE_WEI)).toBe(ONE_WEI)
    expect(toEthString('0.0000000000000000019')).toBe(ONE_WEI)
    expect(toEthString('0.0000000000000000009')).toBe('0')
    expect(toEthString('1.9999999999999999999')).toBe('1.999999999999999999')
  })

  it('zero e zero negativo viram "0"', () => {
    expect(toEthString('0')).toBe('0')
    expect(toEthString('0.000')).toBe('0')
    expect(toEthString('-0')).toBe('0')
  })

  it('rejeita entrada que não é número', () => {
    for (const bad of ['abc', '', ' 1.5', '1,5', '1.2.3']) expect(() => toEthString(bad)).toThrow()
  })

  it('rejeita NaN e infinito em vez de devolver "NaN"/"Infinity"', () => {
    for (const bad of ['NaN', NaN, 'Infinity', -Infinity]) expect(() => toEthString(bad)).toThrow(RangeError)
  })
})

describe('addEth', () => {
  it('soma sem o erro de ponto flutuante (0.1 + 0.2)', () => {
    expect(0.1 + 0.2).not.toBe(0.3)
    expect(addEth('0.1', '0.2')).toBe('0.3')
  })

  it('soma no nível do wei, inclusive com valores grandes', () => {
    expect(addEth(ONE_WEI, ONE_WEI)).toBe('0.000000000000000002')
    expect(addEth('120000000.000000000000000001', ONE_WEI)).toBe('120000000.000000000000000002')
    expect(addEth('0.999999999999999999', ONE_WEI)).toBe('1')
  })

  it('sem argumentos é zero e aceita qualquer quantidade de parcelas', () => {
    expect(addEth()).toBe('0')
    expect(addEth('1', '2', '3.5', '0.25')).toBe('6.75')
  })

  it('propaga entrada inválida como erro', () => {
    expect(() => addEth('1', 'x')).toThrow()
  })
})

describe('subEth', () => {
  it('subtrai com precisão', () => {
    expect(subEth('1', '0.3')).toBe('0.7')
    expect(subEth('1', ONE_WEI)).toBe('0.999999999999999999')
  })

  it('nunca fica negativo (desconto maior que o valor zera)', () => {
    expect(subEth('0.1', '0.2')).toBe('0')
    expect(subEth('0', '0')).toBe('0')
  })
})

describe('mulEth', () => {
  it('multiplica preço por quantidade sem perda', () => {
    expect(mulEth('0.1', 3)).toBe('0.3')
    expect(mulEth('1.19', 2)).toBe('2.38')
    expect(mulEth(ONE_WEI, 1_000_000)).toBe('0.000000000001')
  })

  it('resultado abaixo de 1 wei é cortado para zero', () => {
    expect(mulEth(ONE_WEI, '0.5')).toBe('0')
  })
})

describe('percentOf', () => {
  it('calcula percentuais exatos', () => {
    expect(percentOf('2.5', '10')).toBe('0.25')
    expect(percentOf('1.19', '25')).toBe('0.2975')
    expect(percentOf('3', '100')).toBe('3')
    expect(percentOf('3', '0')).toBe('0')
  })

  it('arredonda para baixo: nunca dá desconto a mais', () => {
    // 10% de 0.000000000000000019 = 0.0000000000000000019 → 1 wei (e não 2)
    expect(percentOf('0.000000000000000019', '10')).toBe(ONE_WEI)
    expect(percentOf(ONE_WEI, '10')).toBe('0')
    // 1/3 com dízima: corta na 18ª casa
    expect(percentOf('1', '33.333333333333333333')).toBe('0.333333333333333333')
  })
})

describe('compareEth e isZero', () => {
  it('compara strings decimais pelo valor, não pelo texto', () => {
    expect(compareEth('10', '9')).toBe(1)
    expect(compareEth('0.10', '0.1')).toBe(0)
    expect(compareEth('1.000000000000000001', '1')).toBe(1)
    expect(compareEth('0.5', '0.50000000000000001')).toBe(-1)
  })

  it('serve para ordenar preços', () => {
    expect(['10', '9', '0.5', '0.05'].sort(compareEth)).toEqual(['0.05', '0.5', '9', '10'])
  })

  it('isZero reconhece zero em qualquer escrita', () => {
    expect(isZero('0')).toBe(true)
    expect(isZero('0.000000000000000000')).toBe(true)
    expect(isZero(ONE_WEI)).toBe(false)
  })
})

describe('formatEth', () => {
  it('mostra no mínimo 2 e no máximo 4 casas, com unidade', () => {
    expect(formatEth('1')).toBe('1.00 ETH')
    expect(formatEth('1.19')).toBe('1.19 ETH')
    expect(formatEth('0.123')).toBe('0.123 ETH')
    expect(formatEth('0.12345678')).toBe('0.1234 ETH')
  })

  it('corta em vez de arredondar para cima', () => {
    expect(formatEth('1.99999')).toBe('1.9999 ETH')
    expect(formatEth('0.00009')).toBe('0.00 ETH')
  })

  it('respeita maxDecimals e withUnit', () => {
    expect(formatEth('1.23456', { maxDecimals: 2 })).toBe('1.23 ETH')
    expect(formatEth('1.2', { withUnit: false })).toBe('1.20')
    expect(formatEth('0.000001', { maxDecimals: 6, withUnit: false })).toBe('0.000001')
  })

  it('agrupa milhares com vírgula e ponto como separador decimal', () => {
    expect(formatEth('1234567.5')).toBe('1,234,567.50 ETH')
    expect(formatEth('999')).toBe('999.00 ETH')
    expect(formatEth('1000')).toBe('1,000.00 ETH')
  })

  it('não perde dígitos em inteiros acima de 2^53', () => {
    expect(formatEth('12345678901234567890.5', { withUnit: false })).toBe('12,345,678,901,234,567,890.50')
  })

  it('formata zero', () => {
    expect(formatEth('0')).toBe('0.00 ETH')
  })
})

describe('formatBrl', () => {
  const normalize = (s: string) => s.replace(/\s/g, ' ')

  it('converte pela cotação fixa e formata em reais', () => {
    expect(normalize(formatBrl('1'))).toBe('R$ 18.450,32')
    expect(normalize(formatBrl('0'))).toBe('R$ 0,00')
  })

  it('arredonda os centavos', () => {
    // 0.0001 ETH = R$ 1,845032 → R$ 1,85
    expect(normalize(formatBrl('0.0001'))).toBe('R$ 1,85')
  })
})
