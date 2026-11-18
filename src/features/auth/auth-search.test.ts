import { describe, expect, it } from 'vitest'
import { authSearchSchema, isInternalPath } from './auth-search'

describe('redirect do login (redirecionamento aberto)', () => {
  it('aceita caminhos internos com busca e âncora', () => {
    for (const path of ['/', '/carrinho', '/nft/nft-01?edicao=nft-01-ed-3', '/perfil/favoritos#lista', '/pagamento?x=%2F%2Fevil.com']) {
      expect(isInternalPath(path), path).toBe(true)
    }
  })

  it('recusa tudo que o navegador levaria para outro host', () => {
    for (const path of [
      'https://evil.com',
      '//evil.com',
      '/\\evil.com',
      '\\\\evil.com',
      '/\t/evil.com',
      '/\n/evil.com',
      'javascript:alert(1)',
      'evil.com',
      '',
    ]) {
      expect(isInternalPath(path), JSON.stringify(path)).toBe(false)
    }
  })

  it('no schema da busca, redirect inválido vira undefined (sem quebrar a tela)', () => {
    expect(authSearchSchema.parse({ redirect: '/\\evil.com' }).redirect).toBeUndefined()
    expect(authSearchSchema.parse({ redirect: '/carrinho' }).redirect).toBe('/carrinho')
  })
})
