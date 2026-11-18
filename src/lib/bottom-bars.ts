import { useCallback } from 'react'

/**
 * Áreas de ação no rodapé da tela (navegação inferior, barra de compra do detalhe, botão de pagamento,
 * resumo do carrinho no mobile). Cada uma se registra com `useBottomBar()`; o maior espaço que elas ocupam
 * a partir da base da tela vira a variável CSS `--bottom-bars` no <html>. Os avisos (toasts) usam essa
 * variável para ficar logo acima delas e nunca cobrir um botão, em qualquer tela e largura.
 *
 *  - barra fixa (padrão): conta a altura dela quando está `position: fixed` (no desktop elas viram comuns);
 *  - `flow`: painel no fluxo da página que fica encostado embaixo (resumo do carrinho no mobile). Conta o
 *    trecho dele visível na tela, acompanhando a rolagem, só na largura de `media`.
 */
interface BarOptions {
  /** O que sai para cima da caixa da barra (ex.: o botão central redondo da navegação inferior). */
  extra?: number
  flow?: boolean
  media?: string
}

/** Nunca empurra os avisos para cima de 30% da altura da tela (painel alto ou rolado). */
const MAX_SHARE = 0.7

const bars = new Map<HTMLElement, BarOptions>()
const heights = new Map<HTMLElement, number>()
let frame = 0
let observer: ResizeObserver | null = null
let listening = false

function measure(el: HTMLElement, opts: BarOptions) {
  // Escondida, ou atrás de uma tela de conta (a página de fundo fica inerte): não conta.
  if (!el.isConnected || el.offsetHeight === 0 || el.closest('[inert]')) return 0
  if (opts.media && !window.matchMedia(opts.media).matches) return 0
  const vh = window.innerHeight
  if (opts.flow) {
    const rect = el.getBoundingClientRect()
    if (rect.top >= vh || rect.bottom <= vh * (1 - MAX_SHARE)) return 0
    return Math.min(vh - Math.max(rect.top, 0), vh * MAX_SHARE)
  }
  const style = getComputedStyle(el)
  if (style.position !== 'fixed') return 0
  return Math.min(el.offsetHeight + (parseFloat(style.bottom) || 0) + (opts.extra ?? 0), vh * MAX_SHARE)
}

function update() {
  frame = 0
  for (const [el, opts] of bars) heights.set(el, measure(el, opts))
  const max = Math.max(0, ...heights.values())
  document.documentElement.style.setProperty('--bottom-bars', `${Math.round(max)}px`)
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(update)
}

function start() {
  if (listening) return
  listening = true
  // Troca de largura muda a barra de fixa para comum; a rolagem move os painéis no fluxo.
  window.addEventListener('resize', schedule, { passive: true })
  window.addEventListener('scroll', () => [...bars.values()].some((o) => o.flow) && schedule(), { passive: true })
  observer = new ResizeObserver(schedule)
  // Página que cresce ou encolhe (itens entrando/saindo) também move os painéis no fluxo.
  observer.observe(document.body)
}

/** Mede de novo (ex.: a página ficou inerte atrás de uma tela de conta, sem mudar de tamanho). */
export function refreshBottomBars() {
  if (bars.size) schedule()
}

/** Ref de uma área de ação no rodapé (ver opções acima). */
export function useBottomBar({ extra = 0, flow = false, media }: BarOptions = {}) {
  return useCallback(
    (el: HTMLElement | null) => {
      if (!el || typeof ResizeObserver === 'undefined') return
      start()
      bars.set(el, { extra, flow, media })
      observer?.observe(el)
      schedule()
      return () => {
        observer?.unobserve(el)
        bars.delete(el)
        heights.delete(el)
        schedule()
      }
    },
    [extra, flow, media],
  )
}
