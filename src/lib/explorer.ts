import type { Network } from '@/api/contracts'

/** Link da transação no explorador da rede de testes de cada blockchain (Sepolia, Amoy e Devnet). */
export function explorerUrl(network: Network, txHash: string) {
  if (network === 'polygon') return `https://amoy.polygonscan.com/tx/${txHash}`
  if (network === 'solana') return `https://explorer.solana.com/tx/${txHash}?cluster=devnet`
  return `https://sepolia.etherscan.io/tx/${txHash}`
}
