import { describe, expect, it, vi } from 'vitest'
import { applyApiFieldErrors } from './form-errors'
import { cn } from './utils'

type Form = { email: string; username: string; password: string }

describe('erros por campo vindos da API', () => {
  it('aplica só nos campos do formulário e põe o foco no primeiro', () => {
    const setError = vi.fn()
    const applied = applyApiFieldErrors<Form>({ email: 'Já cadastrado', role: 'campo que o formulário não tem', username: 'Em uso' }, setError, ['email', 'username'])
    expect(applied).toBe(true)
    expect(setError).toHaveBeenCalledTimes(2)
    expect(setError).toHaveBeenNthCalledWith(1, 'email', { type: 'server', message: 'Já cadastrado' }, { shouldFocus: true })
    expect(setError).toHaveBeenNthCalledWith(2, 'username', { type: 'server', message: 'Em uso' }, { shouldFocus: false })
  })

  it('sem campos conhecidos: nada aplicado (a tela mostra o erro geral)', () => {
    const setError = vi.fn()
    expect(applyApiFieldErrors<Form>({ outro: 'x' }, setError, ['email'])).toBe(false)
    expect(applyApiFieldErrors<Form>({}, setError, ['email'])).toBe(false)
    expect(setError).not.toHaveBeenCalled()
  })
})

describe('cn (classes do Tailwind)', () => {
  it('junta condicionais e a última classe conflitante vence', () => {
    expect(cn('px-2', false, undefined, 'px-4', ['text-sm', { 'font-bold': true, hidden: false }])).toBe('px-4 text-sm font-bold')
  })
})
