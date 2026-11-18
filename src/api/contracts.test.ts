import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import { CreateOrderInput, EthAmount, isValidAddress, PasswordChangeInput, SignupInput, WalletInput } from './contracts'

/** Mensagens de erro por caminho ("campo" → mensagens), para conferir o que o formulário mostraria. */
function issuesOf(schema: z.ZodTypeAny, value: unknown) {
  const r = schema.safeParse(value)
  if (r.success) return {}
  const out: Record<string, string[]> = {}
  for (const i of r.error.issues) (out[i.path.join('.')] ??= []).push(i.message)
  return out
}

describe('EthAmount', () => {
  it.each(['0', '1', '10', '0.5', '1.19', '0.000000000000000001', '123456789.123456789012345678'])('aceita %s', (v) => {
    expect(EthAmount.safeParse(v).success).toBe(true)
  })

  it.each([
    ['número em vez de string', 0.5],
    ['mais de 18 casas', '0.0000000000000000001'],
    ['negativo', '-1'],
    ['notação científica', '1e-18'],
    ['vírgula decimal', '1,5'],
    ['ponto sem casas', '1.'],
    ['ponto sem inteiro', '.5'],
    ['espaços', ' 1'],
    ['vazio', ''],
    ['NaN', 'NaN'],
  ])('rejeita %s', (_label, v) => {
    expect(EthAmount.safeParse(v).success).toBe(false)
  })
})

describe('isValidAddress', () => {
  const evm = `0x${'aB'.repeat(20)}`
  const sol = '7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV'

  it('EVM (Ethereum e Polygon): 0x + 40 hexadecimais', () => {
    expect(isValidAddress(evm, 'ethereum')).toBe(true)
    expect(isValidAddress(evm, 'polygon')).toBe(true)
    expect(isValidAddress(evm.slice(0, -1), 'ethereum')).toBe(false)
    expect(isValidAddress(`${evm}0`, 'ethereum')).toBe(false)
    expect(isValidAddress(`0x${'g'.repeat(40)}`, 'ethereum')).toBe(false)
    expect(isValidAddress('ab'.repeat(21), 'ethereum')).toBe(false)
  })

  it('Solana: base58 de 32 a 44 caracteres, sem 0, O, I e l', () => {
    expect(isValidAddress(sol, 'solana')).toBe(true)
    expect(isValidAddress('1'.repeat(32), 'solana')).toBe(true)
    expect(isValidAddress('1'.repeat(31), 'solana')).toBe(false)
    expect(isValidAddress('1'.repeat(45), 'solana')).toBe(false)
    expect(isValidAddress(`${sol.slice(0, -1)}0`, 'solana')).toBe(false)
    expect(isValidAddress(`${sol.slice(0, -1)}l`, 'solana')).toBe(false)
  })

  it('o endereço de uma rede não vale na outra', () => {
    expect(isValidAddress(evm, 'solana')).toBe(false)
    expect(isValidAddress(sol, 'ethereum')).toBe(false)
  })
})

describe('WalletInput', () => {
  const base = {
    role: 'primary',
    displayName: 'Ana',
    nickname: 'Principal',
    network: 'ethereum',
    profileName: 'Ana Colecionadora',
    address: `0x${'1'.repeat(40)}`,
    secondaryAddress: null,
    provider: 'metamask',
    referralCode: 'ANA-2026',
    email: 'ana@kurio.test',
    ensName: 'ana-colecionadora',
  }

  it('aceita uma carteira válida e apara espaços', () => {
    const r = WalletInput.parse({ ...base, displayName: '  Ana  ', address: `  ${base.address}  ` })
    expect(r.displayName).toBe('Ana')
    expect(r.address).toBe(base.address)
  })

  it('valida o endereço conforme a rede escolhida', () => {
    expect(issuesOf(WalletInput, { ...base, network: 'solana' }).address).toEqual(['Endereço Solana inválido'])
    expect(issuesOf(WalletInput, { ...base, address: '0x123' }).address?.[0]).toMatch(/0x seguido de 40/)
    expect(WalletInput.safeParse({ ...base, network: 'polygon' }).success).toBe(true)
    expect(WalletInput.safeParse({ ...base, network: 'solana', address: '7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV' }).success).toBe(true)
  })

  it('endereço vazio mostra só "Informe o endereço" (o refine também acusa, mas no mesmo campo)', () => {
    expect(issuesOf(WalletInput, { ...base, address: '   ' }).address?.[0]).toBe('Informe o endereço da carteira')
  })

  it('endereço secundário: nome ENS (.eth) ou endereço válido da mesma rede', () => {
    expect(WalletInput.safeParse({ ...base, secondaryAddress: 'ana.eth' }).success).toBe(true)
    expect(WalletInput.safeParse({ ...base, secondaryAddress: `0x${'2'.repeat(40)}` }).success).toBe(true)
    expect(WalletInput.safeParse({ ...base, secondaryAddress: '' }).success).toBe(true)
    expect(issuesOf(WalletInput, { ...base, secondaryAddress: 'ana.sol' }).secondaryAddress).toEqual(['Use um nome ENS (.eth) ou um endereço válido'])
    expect(issuesOf(WalletInput, { ...base, network: 'solana', address: '1'.repeat(32), secondaryAddress: `0x${'2'.repeat(40)}` }).secondaryAddress).toBeDefined()
  })

  it('código de indicação, ENS e e-mail', () => {
    const issues = issuesOf(WalletInput, { ...base, referralCode: 'ab', ensName: 'Ana_Col', email: 'ana' })
    expect(Object.keys(issues).sort()).toEqual(['email', 'ensName', 'referralCode'])
    expect(WalletInput.safeParse({ ...base, referralCode: 'A'.repeat(17) }).success).toBe(false)
  })

  it('rede e provedor fora da lista são rejeitados', () => {
    expect(issuesOf(WalletInput, { ...base, network: 'bitcoin' }).network).toBeDefined()
    expect(issuesOf(WalletInput, { ...base, provider: 'phantom' }).provider).toBeDefined()
  })
})

describe('SignupInput', () => {
  const base = { username: 'ana_col', email: 'ana@kurio.test', password: 'Selva2026', confirmPassword: 'Selva2026' }

  it('aceita um cadastro válido', () => {
    expect(SignupInput.safeParse(base).success).toBe(true)
  })

  it('senha: 8+ caracteres, com letra e número', () => {
    expect(issuesOf(SignupInput, { ...base, password: 'Ab1', confirmPassword: 'Ab1' }).password).toContain('A senha precisa ter pelo menos 8 caracteres')
    expect(issuesOf(SignupInput, { ...base, password: '12345678', confirmPassword: '12345678' }).password).toEqual(['Use pelo menos uma letra'])
    expect(issuesOf(SignupInput, { ...base, password: 'abcdefgh', confirmPassword: 'abcdefgh' }).password).toEqual(['Use pelo menos um número'])
  })

  it('confirmação diferente acusa no campo de confirmação', () => {
    expect(issuesOf(SignupInput, { ...base, confirmPassword: 'Selva2027' })).toEqual({ confirmPassword: ['As senhas não conferem'] })
  })

  it('confirmação vazia pede para confirmar', () => {
    expect(issuesOf(SignupInput, { ...base, confirmPassword: '' }).confirmPassword?.[0]).toBe('Confirme sua senha')
  })

  it('usuário: 3 a 20 caracteres minúsculos, números e _ (apara espaços)', () => {
    expect(SignupInput.parse({ ...base, username: '  ana_col  ' }).username).toBe('ana_col')
    expect(SignupInput.safeParse({ ...base, username: 'Ana' }).success).toBe(false)
    expect(SignupInput.safeParse({ ...base, username: 'an' }).success).toBe(false)
    expect(SignupInput.safeParse({ ...base, username: 'a'.repeat(21) }).success).toBe(false)
    expect(SignupInput.safeParse({ ...base, username: 'ana-col' }).success).toBe(false)
  })

  it('e-mail inválido', () => {
    expect(issuesOf(SignupInput, { ...base, email: 'ana@' }).email).toEqual(['Informe um e-mail válido'])
  })
})

describe('PasswordChangeInput', () => {
  const base = { currentPassword: 'Selva2026!', newPassword: 'Selva2027!', confirmPassword: 'Selva2027!' }

  it('aceita uma troca válida', () => {
    expect(PasswordChangeInput.safeParse(base).success).toBe(true)
  })

  it('confirmação precisa bater com a nova senha', () => {
    expect(issuesOf(PasswordChangeInput, { ...base, confirmPassword: 'outra123' })).toEqual({ confirmPassword: ['As senhas não conferem'] })
  })

  it('nova senha igual à atual é recusada no campo da nova senha', () => {
    expect(issuesOf(PasswordChangeInput, { ...base, newPassword: base.currentPassword, confirmPassword: base.currentPassword })).toEqual({
      newPassword: ['A nova senha precisa ser diferente da atual'],
    })
  })

  it('os dois refinements aparecem juntos quando os dois falham', () => {
    const issues = issuesOf(PasswordChangeInput, { currentPassword: 'Selva2026!', newPassword: 'Selva2026!', confirmPassword: 'x' })
    expect(issues.confirmPassword).toEqual(['As senhas não conferem'])
    expect(issues.newPassword).toEqual(['A nova senha precisa ser diferente da atual'])
  })

  it('senha atual obrigatória e nova senha segue a regra de força', () => {
    expect(issuesOf(PasswordChangeInput, { ...base, currentPassword: '' }).currentPassword).toEqual(['Informe a senha atual'])
    expect(issuesOf(PasswordChangeInput, { ...base, newPassword: 'curta1', confirmPassword: 'curta1' }).newPassword).toContain(
      'A senha precisa ter pelo menos 8 caracteres',
    )
  })
})

describe('CreateOrderInput', () => {
  const base = {
    quoteId: 'qt-1',
    fingerprint: 'abc123',
    walletId: 'wal-ana-1',
    network: 'ethereum',
    provider: 'metamask',
    collector: {
      displayName: 'Ana',
      username: 'ana_col',
      profileName: 'Ana Colecionadora',
      email: 'ana@kurio.test',
      ensName: 'ana-col',
      referralCode: 'KURIO',
      note: '',
    },
  }

  it('aceita um pedido completo e apara os campos do colecionador', () => {
    const r = CreateOrderInput.parse({ ...base, collector: { ...base.collector, displayName: '  Ana  ', note: '  presente  ' } })
    expect(r.collector.displayName).toBe('Ana')
    expect(r.collector.note).toBe('presente')
  })

  it('exige cotação, fingerprint e carteira', () => {
    const { quoteId: _q, fingerprint: _f, ...rest } = base
    expect(Object.keys(issuesOf(CreateOrderInput, rest)).sort()).toEqual(['fingerprint', 'quoteId'])
  })

  it('rede e provedor precisam ser conhecidos', () => {
    expect(issuesOf(CreateOrderInput, { ...base, network: 'bitcoin' }).network).toBeDefined()
    expect(issuesOf(CreateOrderInput, { ...base, provider: 'ledger' }).provider).toBeDefined()
  })

  it('observação até 280 caracteres', () => {
    expect(CreateOrderInput.safeParse({ ...base, collector: { ...base.collector, note: 'x'.repeat(280) } }).success).toBe(true)
    expect(issuesOf(CreateOrderInput, { ...base, collector: { ...base.collector, note: 'x'.repeat(281) } })['collector.note']).toEqual([
      'Máximo de 280 caracteres',
    ])
  })

  it('colecionador inválido acusa cada campo pelo caminho', () => {
    const issues = issuesOf(CreateOrderInput, { ...base, collector: { ...base.collector, username: 'A', email: 'x', referralCode: '!' } })
    expect(Object.keys(issues).sort()).toEqual(['collector.email', 'collector.referralCode', 'collector.username'])
  })
})
