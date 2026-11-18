import { lazy, Suspense, useEffect, useState } from 'react'
import { loadGsap, prefersReducedMotion, whenIdle } from '@/lib/motion'

// Animações globais (GSAP + rolagem suave): chunk próprio, baixado só depois do carregamento.
const MotionLayer = lazy(() => import('./motion-layer'))

/**
 * Liga a camada de movimento quando a página já carregou e o navegador ficou ocioso (não disputa com
 * o LCP nem com o TBT); desliga na hora se o usuário passar a pedir menos movimento.
 */
export function MotionBoot() {
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    let cancelIdle = () => {}
    const sync = () => {
      cancelIdle()
      if (prefersReducedMotion()) setEnabled(false)
      else
        cancelIdle = whenIdle(() => {
          void loadGsap()
          setEnabled(true)
        })
    }
    sync()
    query.addEventListener('change', sync)
    return () => {
      cancelIdle()
      query.removeEventListener('change', sync)
    }
  }, [])
  if (!enabled) return null
  return (
    <Suspense fallback={null}>
      <MotionLayer />
    </Suspense>
  )
}
