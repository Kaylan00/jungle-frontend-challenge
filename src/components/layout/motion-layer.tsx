/**
 * Camada de movimento do app (carregada sob demanda, depois do carregamento inicial — ver __root.tsx).
 * Concentra tudo o que é global e usa GSAP com useGSAP (limpeza automática no desmonte):
 *  1. transição curta do conteúdo do <main> ao trocar de página;
 *  2. entrada em cascata (stagger) dos itens de toda lista marcada com data-reveal-group;
 *  3. contador do carrinho "pulando" quando aumenta (elementos com data-bump);
 *  4. rolagem suave com Lenis no desktop (roda de mouse/trackpad), sem mexer em toque nem teclado.
 *
 * Regras (requisitos de acessibilidade e de performance):
 *  - com prefers-reduced-motion nada disso roda (a camada nem é montada; ver __root.tsx);
 *  - nada que já estava na tela no carregamento é escondido (sem opacity 0 acima da dobra: LCP);
 *    só o que aparece depois (troca de página, nova lista, rolagem) entra animado;
 *  - só transform e opacity são animados (CLS continua 0) e os estilos são limpos ao terminar;
 *  - páginas com barra fixa (data-motion-fixed) só fazem fade: transform no <main> mudaria a
 *    referência do position: fixed durante a animação.
 */
import { useGSAP } from '@gsap/react'
import { useRouter } from '@tanstack/react-router'
import { gsap } from 'gsap'
import Lenis from 'lenis'
import { useRef } from 'react'
import { loadGsap, prefersReducedMotion } from '@/lib/motion'

gsap.registerPlugin(useGSAP)
void loadGsap()

const ITEM = '[data-reveal-group] > *'
/** Itens escondidos esperando entrar na tela. */
const HIDDEN = 'data-reveal-pending'

export default function MotionLayer() {
  const router = useRouter()
  const lenisRef = useRef<Lenis | null>(null)

  useGSAP(() => {
    const main = document.getElementById('conteudo')
    if (!main || prefersReducedMotion()) return

    // O usuário já interagiu? Antes disso, conteúdo que chega dentro da tela aparece direto (LCP).
    let interacted = false
    const markInteracted = () => (interacted = true)
    const interactionEvents = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
    interactionEvents.forEach((t) => window.addEventListener(t, markInteracted, { once: true, passive: true, capture: true }))

    /* ---------- 1. Transição entre páginas ---------- */
    const unsubscribe = router.subscribe('onResolved', (e) => {
      if (!e.pathChanged) return
      lenisRef.current?.stop()
      lenisRef.current?.start()
      gsap.killTweensOf(main)
      const slide = !main.querySelector('[data-motion-fixed]')
      gsap.fromTo(
        main,
        { opacity: 0, y: slide ? 14 : 0 },
        { opacity: 1, y: 0, duration: 0.32, ease: 'power2.out', clearProps: 'opacity,transform' },
      )
    })

    /* ---------- 2. Entrada em cascata ---------- */
    const inView = (el: Element) => {
      const r = el.getBoundingClientRect()
      return r.top < window.innerHeight && r.bottom > 0
    }
    const show = (items: Element[]) => {
      if (!items.length) return
      items.forEach((el) => el.removeAttribute(HIDDEN))
      gsap.fromTo(
        items,
        { opacity: 0, y: 18 },
        { opacity: 1, y: 0, duration: 0.42, stagger: { each: 0.055, from: 'start' }, ease: 'power2.out', overwrite: true, clearProps: 'opacity,transform' },
      )
    }
    // Itens que entram na tela juntos animam juntos, em sequência.
    let batch: Element[] = []
    let batchFrame = 0
    const queue = (el: Element) => {
      batch.push(el)
      if (!batchFrame)
        batchFrame = requestAnimationFrame(() => {
          batchFrame = 0
          const items = batch.filter((el) => el.isConnected)
          batch = []
          show(items)
        })
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          io.unobserve(entry.target)
          queue(entry.target)
        }
      },
      { rootMargin: '0px 0px -6% 0px' },
    )
    const hide = (el: Element) => {
      gsap.set(el, { opacity: 0, y: 18 })
      el.setAttribute(HIDDEN, '')
      io.observe(el)
    }
    /** Item novo: fora da tela fica esperando a rolagem; dentro da tela entra animado (se já houve interação). */
    const handle = (el: Element, isNew: boolean) => {
      if (el.hasAttribute(HIDDEN)) return
      if (!inView(el)) hide(el)
      else if (isNew && interacted) {
        gsap.set(el, { opacity: 0, y: 18 })
        queue(el)
      }
    }
    // O que já está na página: só o que está abaixo da dobra é preparado.
    main.querySelectorAll(ITEM).forEach((el) => handle(el, false))

    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type !== 'childList') continue
        // Item que saiu da página antes de aparecer: para de observar.
        m.removedNodes.forEach((node) => {
          if (!(node instanceof Element)) return
          if (node.hasAttribute(HIDDEN)) io.unobserve(node)
          node.querySelectorAll(`[${HIDDEN}]`).forEach((el) => io.unobserve(el))
        })
        m.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return
          if (node.parentElement?.hasAttribute('data-reveal-group')) handle(node, true)
          node.querySelectorAll(ITEM).forEach((el) => handle(el, true))
        })
      }
    })
    mo.observe(main, { childList: true, subtree: true })

    // Foco por teclado num item ainda escondido: mostra na hora.
    const onFocusIn = (e: FocusEvent) => {
      const item = (e.target as Element | null)?.closest?.(`[${HIDDEN}]`)
      if (item) {
        io.unobserve(item)
        item.removeAttribute(HIDDEN)
        gsap.set(item, { clearProps: 'opacity,transform' })
      }
    }
    main.addEventListener('focusin', onFocusIn)

    /* ---------- 3. Contador do carrinho ---------- */
    const last = new Map<string, number>()
    const readBumps = () =>
      document.querySelectorAll<HTMLElement>('[data-bump]').forEach((el) => {
        const key = el.dataset.bump!
        if (!last.has(key)) last.set(key, Number(el.textContent) || 0)
      })
    readBumps()
    const bumpObserver = new MutationObserver((mutations) => {
      const keys = new Set<string>()
      for (const m of mutations) {
        const target = m.target instanceof Element ? m.target : m.target.parentElement
        const key = target?.closest<HTMLElement>('[data-bump]')?.dataset.bump
        if (key) keys.add(key)
        m.addedNodes.forEach((n) => {
          if (!(n instanceof HTMLElement)) return
          if (n.dataset.bump) keys.add(n.dataset.bump)
          n.querySelectorAll<HTMLElement>('[data-bump]').forEach((x) => keys.add(x.dataset.bump!))
        })
        // O badge some quando o carrinho zera: o próximo que aparecer conta a partir de 0.
        m.removedNodes.forEach((n) => {
          const k = n instanceof HTMLElement ? n.dataset.bump : undefined
          if (k && !document.querySelector(`[data-bump="${k}"]`)) last.set(k, 0)
        })
      }
      keys.forEach((key) => {
        const els = document.querySelectorAll<HTMLElement>(`[data-bump="${key}"]`)
        if (!els.length) return
        const value = Number(els[0].textContent) || 0
        // Sem badge até agora = carrinho vazio (0).
        const prev = last.get(key) ?? 0
        last.set(key, value)
        if (value <= prev) return
        els.forEach((el) => gsap.fromTo(el, { scale: 1.6 }, { scale: 1, duration: 0.5, ease: 'back.out(3)', overwrite: true, clearProps: 'transform' }))
      })
    })
    bumpObserver.observe(document.body, { childList: true, subtree: true, characterData: true })

    /* ---------- 4. Rolagem suave (só mouse/trackpad) ---------- */
    let lenis: Lenis | null = null
    let lockObserver: MutationObserver | null = null
    const tick = (time: number) => lenis?.raf(time * 1000)
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      lenis = new Lenis({
        lerp: 0.12,
        wheelMultiplier: 0.95,
        smoothWheel: true,
        // Toque e teclado continuam nativos. Listas roláveis (filtros, painel, menus) rolam sozinhas.
        syncTouch: false,
        allowNestedScroll: true,
        stopInertiaOnNavigate: true,
        // Diálogos, gavetas e menus do Radix rolam nativamente.
        prevent: (node) => node.matches('[role="dialog"], [role="listbox"], [role="menu"], [data-radix-popper-content-wrapper]'),
      })
      lenisRef.current = lenis
      gsap.ticker.add(tick)
      gsap.ticker.lagSmoothing(0)
      // Modal aberto (o Radix trava a rolagem com data-scroll-locked no body): a página de trás não rola.
      const syncLock = () => (document.body.hasAttribute('data-scroll-locked') ? lenis?.stop() : lenis?.start())
      lockObserver = new MutationObserver(syncLock)
      lockObserver.observe(document.body, { attributes: true, attributeFilter: ['data-scroll-locked'] })
      syncLock()
    }

    return () => {
      interactionEvents.forEach((t) => window.removeEventListener(t, markInteracted, { capture: true }))
      unsubscribe()
      io.disconnect()
      mo.disconnect()
      bumpObserver.disconnect()
      lockObserver?.disconnect()
      cancelAnimationFrame(batchFrame)
      main.removeEventListener('focusin', onFocusIn)
      main.querySelectorAll(`[${HIDDEN}]`).forEach((el) => {
        el.removeAttribute(HIDDEN)
        gsap.set(el, { clearProps: 'opacity,transform' })
      })
      gsap.ticker.remove(tick)
      lenis?.destroy()
      lenisRef.current = null
    }
  })

  return null
}
