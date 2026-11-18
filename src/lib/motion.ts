/**
 * Base das animações (GSAP), pensada para não pesar o carregamento inicial:
 * - o GSAP só é baixado depois que a página carregou e o navegador ficou ocioso (ver MotionLayer);
 * - quem precisa animar antes disso (ex.: arrastar o destaque logo de cara) pede com loadGsap()
 *   e, enquanto ele não chega, aplica o estado final sem animação;
 * - com prefers-reduced-motion nada é animado (requisito de acessibilidade). Os testes E2E rodam com
 *   reducedMotion: 'reduce' (playwright.config.ts), então nunca esperam animação terminar.
 */
import type { gsap as GsapType } from 'gsap'

export type Gsap = typeof GsapType

const reducedQuery = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null

/** true quando o usuário pediu menos movimento (consultado na hora: a preferência pode mudar com a página aberta). */
export const prefersReducedMotion = () => reducedQuery?.matches ?? true

let instance: Gsap | null = null
let pending: Promise<Gsap> | null = null

/** Baixa o GSAP uma única vez (chunk separado). */
export function loadGsap(): Promise<Gsap> {
  pending ??= import('gsap').then(({ gsap }) => {
    gsap.defaults({ ease: 'power3.out', duration: 0.35 })
    instance = gsap
    return gsap
  })
  return pending
}

/** O GSAP, se já tiver sido carregado (para gsap.set mesmo com movimento reduzido); senão null. */
export const loadedGsap = (): Gsap | null => instance

/** Roda depois do carregamento e com o navegador ocioso (não disputa CPU com o LCP). */
export function whenIdle(fn: () => void, timeout = 2500): () => void {
  let cancelled = false
  let idleId: number | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const run = () => {
    if (cancelled) return
    if ('requestIdleCallback' in window) idleId = window.requestIdleCallback(() => !cancelled && fn(), { timeout })
    else timer = setTimeout(() => !cancelled && fn(), 200)
  }
  if (document.readyState === 'complete') run()
  else window.addEventListener('load', run, { once: true })
  return () => {
    cancelled = true
    window.removeEventListener('load', run)
    if (idleId !== undefined) window.cancelIdleCallback(idleId)
    if (timer) clearTimeout(timer)
  }
}
