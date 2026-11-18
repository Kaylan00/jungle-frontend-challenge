import { useState } from 'react'
import type { Network, Wallet, WalletProvider } from '@/api/contracts'
import { api } from '@/api/endpoints'
import { ApiError } from '@/api/http'
import { NETWORK_LABEL } from '@/features/catalog/search-params'
import { announce } from '@/lib/announcer'
import type { CheckoutFormApi } from './use-checkout-form'

export type Connection = {
  status: 'idle' | 'connecting' | 'connected' | 'rejected'
  walletId?: string
  network?: Network
  message?: string
}

/**
 * Conexão simulada da carteira escolhida na rede escolhida. Trocar de carteira, de rede ou de tipo de carteira
 * desconecta: a conexão só vale para a combinação com que foi feita.
 */
export function useWalletConnection({ form, wallet, walletId, network }: CheckoutFormApi) {
  const [conn, setConn] = useState<Connection>({ status: 'idle' })
  const connected = conn.status === 'connected' && conn.walletId === walletId && conn.network === network

  const connect = async () => {
    if (!wallet) return
    if (wallet.network !== network) {
      form.setError('network', {
        type: 'manual',
        message: `A carteira ${wallet.nickname} opera na rede ${NETWORK_LABEL[wallet.network]}`,
      })
      return
    }
    setConn({ status: 'connecting', walletId, network })
    try {
      await api.connectWallet(wallet.id, network)
      setConn({ status: 'connected', walletId, network })
      announce(`Carteira ${wallet.nickname} conectada na rede ${NETWORK_LABEL[network]}`)
    } catch (e) {
      const message = e instanceof ApiError && e.code === 'WALLET_REJECTED' ? 'Conexão recusada na carteira. Você pode tentar de novo.' : e instanceof ApiError ? e.message : 'Falha ao conectar'
      setConn({ status: 'rejected', walletId, network, message })
      announce(message, 'assertive')
    }
  }

  const disconnect = async () => {
    if (conn.walletId) await api.disconnectWallet(conn.walletId).catch(() => undefined)
    setConn({ status: 'idle' })
    announce('Carteira desconectada')
  }

  /** Mudou algo que a conexão atual não cobre: desconecta. */
  const dropConnection = () => {
    if (conn.status === 'connected') void disconnect()
  }

  const selectWallet = (w: Wallet) => {
    dropConnection()
    form.setValue('walletId', w.id, { shouldValidate: true })
    form.setValue('network', w.network, { shouldValidate: true })
    form.setValue('provider', w.provider)
    form.clearErrors('network')
  }

  const selectProvider = (p: WalletProvider) => {
    dropConnection()
    form.setValue('provider', p)
  }

  /** Aviso no quadro da conexão (ex.: tentou revisar sem conectar, ou a API recusou a carteira). */
  const flagConnection = (message: string, reset = false) =>
    setConn((c) => (reset ? { status: 'idle', message } : { ...c, status: c.status === 'connected' ? 'idle' : c.status, message }))

  return { conn, connected, connect, disconnect, dropConnection, selectWallet, selectProvider, flagConnection }
}

export type WalletConnectionApi = ReturnType<typeof useWalletConnection>
