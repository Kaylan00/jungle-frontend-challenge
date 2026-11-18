import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Wallet } from '@/api/contracts'
import { createMemoryStorage } from '@/test/memory-storage'
import { CheckoutValues, clearDraft, loadDraft, saveDraft, walletShortAddress } from './checkout-model'

const VALID = {
  displayName: 'Ana Colecionadora',
  username: 'ana_nft',
  profileName: 'ana',
  email: 'ana@kurio.test',
  ensName: 'ana-nft',
  referralCode: 'KURIO-1',
  note: '',
  network: 'ethereum',
  provider: 'metamask',
  walletId: 'wal-ana-1',
}

beforeEach(() => {
  vi.stubGlobal('sessionStorage', createMemoryStorage())
})

describe('formulário do pagamento', () => {
  it('aceita os dados completos e exige carteira, rede e tipo de carteira', () => {
    expect(CheckoutValues.safeParse(VALID).success).toBe(true)
    const missing = CheckoutValues.safeParse({ ...VALID, walletId: '', network: 'bitcoin', provider: 'outro' })
    expect(missing.success).toBe(false)
    const paths = missing.error!.issues.map((i) => i.path[0])
    expect(paths).toEqual(expect.arrayContaining(['walletId', 'network', 'provider']))
    expect(missing.error!.issues.find((i) => i.path[0] === 'walletId')?.message).toBe('Selecione uma carteira')
  })
})

describe('rascunho (sobrevive a refresh e à expiração da sessão)', () => {
  it('salva, recupera e limpa', () => {
    expect(loadDraft()).toBeNull()
    saveDraft(VALID)
    expect(loadDraft()).toEqual(VALID)
    clearDraft()
    expect(loadDraft()).toBeNull()
  })

  it('rascunho de uma versão anterior sem "note" volta com a observação vazia', () => {
    const { note: _note, ...old } = VALID
    sessionStorage.setItem('kurio.checkout.draft', JSON.stringify(old))
    expect(loadDraft()).toEqual(VALID)
  })

  it('rascunho corrompido ou storage indisponível não quebram o pagamento', () => {
    sessionStorage.setItem('kurio.checkout.draft', '{quebrado')
    expect(loadDraft()).toBeNull()
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('bloqueado')
      },
      setItem: () => {
        throw new Error('bloqueado')
      },
      removeItem: () => {
        throw new Error('bloqueado')
      },
    })
    expect(loadDraft()).toBeNull()
    expect(() => saveDraft(VALID)).not.toThrow()
    expect(() => clearDraft()).not.toThrow()
  })
})

describe('endereço da carteira nas listas', () => {
  it('usa o ENS/endereço secundário; sem ele, encurta o endereço', () => {
    const wallet = { address: '0xA91F00000000000000000000000000000000E82C', secondaryAddress: null } as Wallet
    expect(walletShortAddress(wallet)).toBe('0xA91F…E82C')
    expect(walletShortAddress({ ...wallet, secondaryAddress: 'nova.kurio.eth' })).toBe('nova.kurio.eth')
  })
})
