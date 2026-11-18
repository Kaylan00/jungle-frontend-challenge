import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { featuredQuery } from '@/api/queries'
import { Skeleton } from '@/components/ui/skeleton'
import { ART_SIZES, artSources } from '@/lib/art'
import { loadedGsap, loadGsap, prefersReducedMotion, whenIdle } from '@/lib/motion'
import { cn } from '@/lib/utils'

/*
 * Fundo do cartão mobile, com os valores do Inspecionar do Figma (Hero Banner > Mask Group):
 * retângulo 366x190 raio 30 em #D28A4C 20%→10%, e duas elipses de 248px por cima —
 * "Ellipse 49" em (-80, -31) com #DD9A5F 43%→#D28A4C 4% e "Ellipse 50" em (73, -10) com #DD9A5F 37%→#D28A4C 0%.
 */
const MOBILE_HERO_BG = 'linear-gradient(180deg, rgba(210, 138, 76, 0.2), rgba(210, 138, 76, 0.1))'
const MOBILE_HERO_ELLIPSES = [
  { left: -80, top: -31, from: 'rgba(221, 154, 95, 0.43)', to: 'rgba(210, 138, 76, 0.04)' },
  { left: 73, top: -10, from: 'rgba(221, 154, 95, 0.37)', to: 'rgba(210, 138, 76, 0)' },
]

/** Troca sozinha a cada 6 s (pausa no hover, no foco, no toque e com movimento reduzido). */
const AUTOPLAY_MS = 6000

/**
 * Posiciona a faixa de slides: xPercent = slide atual, x = quanto o dedo/mouse arrastou.
 * Com GSAP carregado e movimento permitido, a troca é animada; senão vai direto ao estado final.
 */
function place(track: HTMLElement | null, index: number, dragPx: number, animate: boolean) {
  if (!track) return
  const gsap = loadedGsap()
  if (!gsap) {
    track.style.transform = index || dragPx ? `translate3d(calc(${-index * 100}% + ${dragPx}px), 0, 0)` : ''
    return
  }
  if (animate && !prefersReducedMotion()) gsap.to(track, { xPercent: -index * 100, x: 0, duration: 0.55, ease: 'power3.out', overwrite: true })
  else gsap.set(track, { xPercent: -index * 100, x: dragPx, overwrite: true })
}

/**
 * Destaques: NFTs marcados como featured pela API, num carrossel que troca pelos pontos (mouse, toque ou
 * teclado), arrastando com o dedo/mouse e sozinho a cada 6 s.
 * A primeira arte é o LCP: aparece direto, sem animação de entrada; as outras só entram no DOM depois
 * do carregamento (navegador ocioso) ou no primeiro toque.
 */
export function Hero() {
  const { data, isPending } = useQuery(featuredQuery)
  const items = data?.items.slice(0, 3) ?? []
  const count = items.length
  const [index, setIndex] = useState(0)
  const [ready, setReady] = useState(false)
  const desktopTrack = useRef<HTMLDivElement>(null)
  const mobileTrack = useRef<HTMLDivElement>(null)
  const smallArt = useRef<HTMLImageElement>(null)
  const pauses = useRef(new Set<string>())
  const lastChange = useRef(0)
  // Depois que a pessoa troca de slide por conta própria, o carrossel não troca mais sozinho.
  const stopped = useRef(false)

  useEffect(() => whenIdle(() => setReady(true)), [])

  const go = (next: number) => {
    if (!count) return
    stopped.current = true
    setIndex(((next % count) + count) % count)
  }

  // Troca de slide: as duas faixas (desktop e mobile) vão juntas. O primeiro render não mexe em nada (LCP).
  const shown = useRef(0)
  useLayoutEffect(() => {
    if (shown.current === index) return
    shown.current = index
    lastChange.current = performance.now()
    place(desktopTrack.current, index, 0, true)
    place(mobileTrack.current, index, 0, true)
    const gsap = loadedGsap()
    if (gsap && smallArt.current && !prefersReducedMotion())
      gsap.fromTo(smallArt.current, { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(2)', clearProps: 'opacity,transform' })
  }, [index])

  // Troca automática.
  useEffect(() => {
    if (count < 2 || !ready) return
    lastChange.current = performance.now()
    const id = setInterval(() => {
      if (stopped.current || pauses.current.size || document.hidden || prefersReducedMotion()) return
      if (performance.now() - lastChange.current >= AUTOPLAY_MS) setIndex((i) => (i + 1) % count)
    }, 500)
    return () => clearInterval(id)
  }, [count, ready])

  const pause = (reason: string) => pauses.current.add(reason)
  const resume = (reason: string) => {
    if (pauses.current.delete(reason) && !pauses.current.size) lastChange.current = performance.now()
  }
  // Hover (mouse) e foco por teclado em qualquer parte do destaque pausam a troca automática.
  const sectionHandlers = {
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse') pause('hover')
      void loadGsap()
    },
    onPointerLeave: () => resume('hover'),
    onFocus: () => pause('focus'),
    onBlur: (e: React.FocusEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget)) resume('focus')
    },
  }

  const swipeDesktop = useSwipe(desktopTrack, { index, count, go, pause, resume, wake: () => setReady(true) })
  const swipeMobile = useSwipe(mobileTrack, { index, count, go, pause, resume, wake: () => setReady(true) })
  const next = items[(index + 1) % Math.max(count, 1)]

  return (
    <section aria-labelledby="hero-title" className="container-page" {...sectionHandlers}>
      {/* Desktop (Figma 1440: arte 450x450 em x=870, texto em x=160). Em telas largas arte, recuos e
          pontos crescem na mesma proporção do conteúdo; o texto fica centralizado na altura da arte, como no Figma. */}
      <div className="hidden grid-cols-[1fr_450px] gap-10 pt-8 md:grid wide:grid-cols-[1fr_calc(450*var(--u))] wide:gap-[calc(40*var(--u))]">
        <div className="pt-[39px] md:pl-4 xl:pl-10 wide:self-center wide:pl-[calc(40*var(--u))] wide:pt-0">
          <p className="text-sm leading-6 tracking-[0.1em]">Bem-vindo à Kurio</p>
          <h1 id="hero-title" className="mt-[5px] text-[34px] font-bold uppercase leading-[1.6] lg:text-[43px] lg:leading-[70px]">
            Seja dono do futuro
            <br />
            da arte digital
          </h1>
          <p className="mt-[3px] max-w-[560px] leading-6 text-muted-foreground">
            Descubra NFTs selecionados de criadores emergentes e consagrados. Colecione arte digital rara, apoie artistas e tenha uma parte da cultura da internet.
          </p>
          <Link
            to="/"
            hash="catalogo"
            className="mt-8 inline-flex h-10 w-[140px] items-center rounded-[4px] bg-primary pl-7 text-base font-semibold uppercase text-primary-foreground shadow-[0_0_0_0_rgba(210,138,76,0)] transition-[background-color,box-shadow,scale] duration-200 hover:bg-primary-hover hover:shadow-[0_6px_22px_-6px_rgba(223,154,94,0.7)] active:scale-[0.97]"
          >
            Explorar
          </Link>
          <Dots count={count || 3} index={index} onSelect={go} className="mt-9 xl:ml-[556px] wide:ml-[calc(556*var(--u))]" />
        </div>
        <div className="relative aspect-square w-full">
          {isPending || !items[0] ? (
            <Skeleton className="size-full rounded-2xl" />
          ) : (
            <div className="size-full touch-pan-y select-none overflow-hidden rounded-2xl" {...swipeDesktop}>
              <div ref={desktopTrack} className="flex size-full will-change-transform">
                {items.map((nft, i) =>
                  i === 0 || ready ? (
                    <Link
                      key={nft.id}
                      to="/nft/$nftId"
                      params={{ nftId: nft.id }}
                      aria-label={`Ver ${nft.name}`}
                      draggable={false}
                      inert={i !== index}
                      className="block size-full shrink-0"
                    >
                      <img
                        {...artSources(nft.image, ART_SIZES.hero)}
                        alt={`Arte do NFT ${nft.name}`}
                        width={450}
                        height={450}
                        draggable={false}
                        fetchPriority={i === 0 ? 'high' : 'low'}
                        decoding={i === 0 ? undefined : 'async'}
                        className="size-full rounded-2xl object-cover"
                      />
                    </Link>
                  ) : (
                    <div key={nft.id} className="size-full shrink-0" />
                  ),
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile (Figma 414: cartão de 366x190, raio de 30px, laranja translúcido com dois círculos; duas artes sobrepostas).
          O cartão inteiro aceita arrastar para os lados; a arte grande acompanha o dedo. */}
      <div
        className="relative mt-4 h-[190px] touch-pan-y select-none overflow-hidden rounded-[30px] md:hidden"
        style={{ background: MOBILE_HERO_BG }}
        {...(count ? swipeMobile : {})}
      >
        {MOBILE_HERO_ELLIPSES.map((e) => (
          <span
            key={e.left}
            aria-hidden="true"
            className="pointer-events-none absolute size-[248px] rounded-full"
            style={{ left: e.left, top: e.top, background: `linear-gradient(180deg, ${e.from}, ${e.to})` }}
          />
        ))}
        <div className="absolute left-4 top-[5px] w-[min(190px,calc(100%_-_170px))] max-[379px]:w-[calc(100%_-_152px)]">
          <p className="text-[12px] leading-4">Bem-vindo à Kurio</p>
          <h1 className="mt-[6px] text-[18px] font-bold uppercase leading-[29px] max-[379px]:text-[16px] max-[379px]:leading-[26px]">Seja dono da cultura digital</h1>
          <p className="mt-[6px] text-[12px] leading-[18px] text-muted-foreground">Descubra NFTs selecionados de criadores do mundo todo.</p>
          <Link
            to="/"
            hash="catalogo"
            draggable={false}
            className="mt-px flex w-fit items-center gap-[9px] text-[12px] font-semibold uppercase leading-4 text-highlight transition-[gap,color] duration-200 hover:gap-3 hover:text-primary-hover active:scale-95"
          >
            Explorar <ArrowRight className="size-4" strokeWidth={2} aria-hidden="true" />
          </Link>
        </div>
        {items[0] ? (
          <div className="absolute right-4 top-[10px] h-[139px] w-[138px] max-[379px]:h-[121px] max-[379px]:w-[120px] overflow-hidden rounded-[16px]">
            <div ref={mobileTrack} className="flex size-full will-change-transform">
              {items.map((nft, i) =>
                i === 0 || ready ? (
                  <img
                    key={nft.id}
                    {...artSources(nft.image, ART_SIZES.hero)}
                    alt=""
                    width={138}
                    height={139}
                    draggable={false}
                    decoding={i === 0 ? undefined : 'async'}
                    className="size-full shrink-0 rounded-[16px] object-cover"
                  />
                ) : (
                  <div key={nft.id} className="size-full shrink-0" />
                ),
              )}
            </div>
          </div>
        ) : (
          <Skeleton className="absolute right-4 top-[10px] h-[139px] w-[138px] max-[379px]:h-[121px] max-[379px]:w-[120px] rounded-[16px]" />
        )}
        {count > 1 && next ? (
          <img
            ref={smallArt}
            {...artSources(next.image, ART_SIZES.heroThumb)}
            alt=""
            width={57}
            height={57}
            draggable={false}
            className="pointer-events-none absolute right-[83px] top-[99px] size-[57px] max-[379px]:right-[69px] rounded-[12px] object-cover shadow-[0_2px_6px_rgba(0,0,0,0.35)]"
          />
        ) : (
          isPending && <Skeleton className="absolute right-[83px] top-[99px] size-[57px] max-[379px]:right-[69px] rounded-[12px] shadow-[0_2px_6px_rgba(0,0,0,0.35)]" />
        )}
        <Dots count={count || 3} index={index} onSelect={go} small className="absolute bottom-[-2px] left-1/2 -translate-x-1/2" />
      </div>
    </section>
  )
}

/**
 * Arrastar para trocar de slide (dedo ou mouse). touch-action: pan-y no alvo deixa a rolagem vertical
 * com o navegador; um gesto mais horizontal que vertical vira arraste, a faixa acompanha o dedo e,
 * ao soltar, passa de slide se andou ~18% da largura ou se foi um movimento rápido.
 * Um arraste nunca vira clique no link da arte.
 */
function useSwipe(
  track: React.RefObject<HTMLDivElement | null>,
  { index, count, go, pause, resume, wake }: { index: number; count: number; go: (i: number) => void; pause: (r: string) => void; resume: (r: string) => void; wake: () => void },
) {
  const drag = useRef<{ id: number; x: number; y: number; t: number; dx: number; active: boolean } | null>(null)
  const swallowClick = useRef(false)

  const end = (e: React.PointerEvent, cancelled: boolean) => {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    drag.current = null
    resume('drag')
    if (!d.active) return
    swallowClick.current = true
    setTimeout(() => (swallowClick.current = false), 0)
    const width = track.current?.clientWidth || 1
    const velocity = d.dx / Math.max(1, performance.now() - d.t)
    let next = index
    if (!cancelled && (d.dx < -width * 0.18 || velocity < -0.5)) next = index + 1
    if (!cancelled && (d.dx > width * 0.18 || velocity > 0.5)) next = index - 1
    next = Math.max(0, Math.min(count - 1, next))
    if (next === index) place(track.current, index, 0, true)
    else go(next)
  }

  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (count < 2 || (e.pointerType === 'mouse' && e.button !== 0)) return
      wake()
      void loadGsap()
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), dx: 0, active: false }
      pause('drag')
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = drag.current
      if (!d || e.pointerId !== d.id) return
      const dx = e.clientX - d.x
      const dy = e.clientY - d.y
      if (!d.active) {
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
          drag.current = null
          resume('drag')
          return
        }
        if (Math.abs(dx) < 8) return
        d.active = true
        d.t = performance.now()
        d.x = e.clientX
        e.currentTarget.setPointerCapture(e.pointerId)
      }
      d.dx = e.clientX - d.x
      // Resistência nas pontas: o primeiro slide não vai para a direita, o último não vai para a esquerda.
      const edge = (index === 0 && d.dx > 0) || (index === count - 1 && d.dx < 0)
      place(track.current, index, edge ? d.dx * 0.25 : d.dx, false)
    },
    onPointerUp: (e: React.PointerEvent) => end(e, false),
    onPointerCancel: (e: React.PointerEvent) => end(e, true),
    onClickCapture: (e: React.MouseEvent) => {
      if (!swallowClick.current) return
      e.preventDefault()
      e.stopPropagation()
      swallowClick.current = false
    },
    onDragStart: (e: React.DragEvent) => e.preventDefault(),
  }
}

/** Pontos do carrossel: o ativo fica cheio e maior; setas do teclado andam entre eles. */
function Dots({ count, index, onSelect, small, className }: { count: number; index: number; onSelect: (i: number) => void; small?: boolean; className?: string }) {
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? count - 1 : delta ? (index + delta + count) % count : null
    if (to === null) return
    e.preventDefault()
    onSelect(to)
    e.currentTarget.querySelectorAll('button')[to]?.focus()
  }
  return (
    <div className={cn('flex', className)} role="group" aria-label="Destaques" onKeyDown={onKeyDown}>
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onSelect(i)}
          aria-label={`Destaque ${i + 1} de ${count}`}
          aria-current={i === index ? 'true' : undefined}
          className="group/dot grid h-6 w-4 place-items-center"
        >
          <span
            className={cn(
              'rounded-full bg-primary transition-[opacity,scale] duration-300 group-hover/dot:scale-125 group-hover/dot:opacity-100',
              small ? 'size-[7px]' : 'size-2',
              i === index ? 'scale-125' : 'opacity-45',
            )}
          />
        </button>
      ))}
    </div>
  )
}
