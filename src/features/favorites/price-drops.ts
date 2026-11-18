/**
 * Alertas de "Preço caiu" dos favoritos.
 *
 * Quem decide é o cliente de tempo real (realtime/client.ts): ao aplicar um `nft.updated` cujo preço ficou
 * menor que o anterior, para um NFT que está nos favoritos do usuário logado, chama `recordPriceDrop`.
 * Daqui saem o aviso (toast + aria-live, em <PriceDropNotifier />) e o selo do item em /perfil/favoritos.
 *
 * Isolamento: tudo é guardado por usuário (chave com o id) no sessionStorage desta aba e apagado na troca de
 * sessão (SessionSync). O selo de uma conta nunca aparece para outra.
 */
import { useSyncExternalStore } from 'react'
import { compareEth } from '@/lib/eth'

export interface PriceDrop {
  nftId: string
  name: string
  /** Preço antes da primeira queda (o selo mostra "Caiu de X") */
  from: string
  /** Preço atual */
  to: string
  at: string
}

type Drops = Record<string, PriceDrop>

const PREFIX = 'kurio.priceDrops.'
const EMPTY: Drops = {}

let userId: string | null = null
let drops: Drops = EMPTY
const listeners = new Set<() => void>()
const alertListeners = new Set<(drop: PriceDrop) => void>()

function storage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}

function load(user: string | null) {
  if (user === userId) return
  userId = user
  drops = EMPTY
  if (!user) return
  try {
    const raw = storage()?.getItem(PREFIX + user)
    if (raw) drops = JSON.parse(raw) as Drops
  } catch {
    drops = EMPTY
  }
}

function save() {
  if (!userId) return
  try {
    storage()?.setItem(PREFIX + userId, JSON.stringify(drops))
  } catch {
    /* sem storage: o selo vale até recarregar a página */
  }
}

function notify() {
  listeners.forEach((l) => l())
}

/** Queda de preço de um favorito: guarda o selo e dispara o aviso. Se cair de novo, mantém o preço "de" original. */
export function recordPriceDrop(user: string, drop: Omit<PriceDrop, 'at'>) {
  load(user)
  const previous = drops[drop.nftId]
  const entry: PriceDrop = { ...drop, from: previous && compareEth(previous.from, drop.from) > 0 ? previous.from : drop.from, at: new Date().toISOString() }
  drops = { ...drops, [drop.nftId]: entry }
  save()
  notify()
  alertListeners.forEach((l) => l(entry))
}

/** O preço voltou a subir até (ou acima de) onde estava: o selo some. Na queda, só atualiza o preço atual. */
export function notePriceChange(user: string, nftId: string, price: string) {
  load(user)
  const current = drops[nftId]
  if (!current) return
  if (compareEth(price, current.from) >= 0) {
    const { [nftId]: _removed, ...rest } = drops
    drops = rest
  } else if (compareEth(price, current.to) !== 0) {
    drops = { ...drops, [nftId]: { ...current, to: price } }
  } else return
  save()
  notify()
}

/** Troca de sessão: apaga os selos guardados nesta aba (de qualquer usuário). */
export function clearPriceDrops() {
  const s = storage()
  try {
    if (s) {
      for (let i = s.length - 1; i >= 0; i--) {
        const key = s.key(i)
        if (key?.startsWith(PREFIX)) s.removeItem(key)
      }
    }
  } catch {
    /* ignore */
  }
  userId = null
  drops = EMPTY
  notify()
}

export function getPriceDrops(user: string | null): Drops {
  load(user)
  return drops
}

export function subscribePriceDrops(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Cada nova queda (para o aviso). */
export function onPriceDropAlert(fn: (drop: PriceDrop) => void) {
  alertListeners.add(fn)
  return () => {
    alertListeners.delete(fn)
  }
}

/** Selos do usuário logado (vazio para visitante). */
export function usePriceDrops(user: string | null): Drops {
  return useSyncExternalStore(
    subscribePriceDrops,
    () => getPriceDrops(user),
    () => EMPTY,
  )
}
