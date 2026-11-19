/** Funções e hooks das seções do Kurio Admin (separados dos componentes por causa do Fast Refresh). */
import { useEffect, useEffectEvent, useState } from 'react'
import Decimal from 'decimal.js'
import type { OrderStatus } from '@/api/contracts'
import { toEthString } from '@/lib/eth'

/** Termo digitado → URL depois de uma pausa (refresh e voltar mantêm a busca). */
export function useDebouncedSearch(urlValue: string | undefined, apply: (value: string | undefined) => void) {
  const [term, setTerm] = useState(urlValue ?? '')
  // A URL mudou por fora (voltar, link): o campo acompanha, ajustado durante a renderização (sem efeito).
  const [syncedUrl, setSyncedUrl] = useState(urlValue)
  if (syncedUrl !== urlValue) {
    setSyncedUrl(urlValue)
    setTerm(urlValue ?? '')
  }
  const commit = useEffectEvent((next: string) => {
    if ((urlValue ?? '') !== next) apply(next || undefined)
  })
  useEffect(() => {
    const t = setTimeout(() => commit(term.trim()), 300)
    return () => clearTimeout(t)
  }, [term])
  return [term, setTerm] as const
}

export const ORDER_STATUS: Record<OrderStatus, { label: string; className: string; dot: string }> = {
  pending: { label: 'Processando', className: 'border-warning/40 bg-warning/10 text-warning', dot: 'bg-warning animate-pulse' },
  confirmed: { label: 'Confirmado', className: 'border-success/40 bg-success/10 text-success', dot: 'bg-success' },
  rejected: { label: 'Recusado', className: 'border-destructive/50 bg-destructive/10 text-[var(--kp-perigo-texto)]', dot: 'bg-destructive' },
}

const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })
const fullDate = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

/** "agora", "há 3 min", "há 2 h", "ontem"… e a data completa no title. */
export function timeAgo(iso: string, now: number) {
  const diff = Math.round((Date.parse(iso) - now) / 1000)
  const abs = Math.abs(diff)
  if (abs < 45) return 'agora'
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86_400) return rtf.format(Math.round(diff / 3600), 'hour')
  return rtf.format(Math.round(diff / 86_400), 'day')
}

export const formatDateTime = (iso: string) => fullDate.format(new Date(iso))

/** Relógio que anda sozinho (para "há 3 min" não ficar parado na tela). */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

/** Divisão exata de um valor em ETH (string decimal) por um inteiro, sem passar por número de ponto flutuante. */
export function divEth(value: string, by: number) {
  return toEthString(new Decimal(value).div(by))
}
