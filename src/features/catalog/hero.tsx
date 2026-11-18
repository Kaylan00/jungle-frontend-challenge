import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { featuredQuery } from '@/api/queries'
import { Skeleton } from '@/components/ui/skeleton'
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

/** Destaques: NFTs marcados como featured pela API, alternados pelos pontos do carrossel. */
export function Hero() {
  const { data, isPending } = useQuery(featuredQuery)
  const items = data?.items.slice(0, 3) ?? []
  const [index, setIndex] = useState(0)
  const current = items[index]

  return (
    <section aria-labelledby="hero-title" className="container-page">
      {/* Desktop (Figma 1440: arte 450x450 em x=870, texto em x=160). Acima de 1440 a arte cresce
          na mesma proporção do conteúdo (37,5%) e os pontos ficam no mesmo lugar relativo. */}
      <div className="hidden grid-cols-[1fr_450px] gap-10 pt-8 md:grid xl:grid-cols-[1fr_max(450px,37.4%)]">
        <div className="pt-[39px] md:pl-4 xl:pl-10 min-[1441px]:self-center min-[1441px]:pt-0!">
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
            className="mt-8 inline-flex h-10 w-[140px] items-center rounded-[4px] bg-primary pl-7 text-base font-semibold uppercase text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            Explorar
          </Link>
          <Dots count={items.length || 3} index={index} onSelect={setIndex} className="mt-9 xl:ml-[max(556px,calc(79.3%_+_23px))]" />
        </div>
        <div className="relative aspect-square w-full">
          {isPending || !current ? (
            <Skeleton className="size-full rounded-2xl" />
          ) : (
            <Link to="/nft/$nftId" params={{ nftId: current.id }} aria-label={`Ver ${current.name}`} className="block size-full">
              <img
                src={current.image}
                alt={`Arte do NFT ${current.name}`}
                width={450}
                height={450}
                fetchPriority="high"
                className="size-full rounded-2xl object-cover"
              />
            </Link>
          )}
        </div>
      </div>

      {/* Mobile (Figma 414: cartão de 366x190, raio de 30px, laranja translúcido com dois círculos; duas artes sobrepostas) */}
      <div className="relative mt-4 h-[190px] overflow-hidden rounded-[30px] md:hidden" style={{ background: MOBILE_HERO_BG }}>
        {MOBILE_HERO_ELLIPSES.map((e) => (
          <span
            key={e.left}
            aria-hidden="true"
            className="pointer-events-none absolute size-[248px] rounded-full"
            style={{ left: e.left, top: e.top, background: `linear-gradient(180deg, ${e.from}, ${e.to})` }}
          />
        ))}
        <div className="absolute left-4 top-[5px] w-[190px]">
          <p className="text-[12px] leading-4">Bem-vindo à Kurio</p>
          <h1 className="mt-[6px] text-[18px] font-bold uppercase leading-[29px]">Seja dono da cultura digital</h1>
          <p className="mt-[6px] text-[12px] leading-[18px] text-muted-foreground">Descubra NFTs selecionados de criadores do mundo todo.</p>
          <Link to="/" hash="catalogo" className="mt-px flex w-fit items-center gap-[9px] text-[12px] font-semibold uppercase leading-4 text-highlight hover:underline">
            Explorar <ArrowRight className="size-4" strokeWidth={2} aria-hidden="true" />
          </Link>
        </div>
        {current ? (
          <img src={current.image} alt="" width={138} height={139} className="absolute right-4 top-[10px] h-[139px] w-[138px] rounded-[16px] object-cover" />
        ) : (
          <Skeleton className="absolute right-4 top-[10px] h-[139px] w-[138px] rounded-[16px]" />
        )}
        {items[1] && (
          <img src={items[1].image} alt="" width={57} height={57} className="absolute left-[226px] top-[99px] size-[57px] rounded-[12px] object-cover shadow-[0_2px_6px_rgba(0,0,0,0.35)]" />
        )}
        <Dots count={items.length || 3} index={index} onSelect={setIndex} small className="absolute bottom-[-2px] left-1/2 -translate-x-1/2" />
      </div>
    </section>
  )
}

function Dots({ count, index, onSelect, small, className }: { count: number; index: number; onSelect: (i: number) => void; small?: boolean; className?: string }) {
  return (
    <div className={cn('flex', className)} role="group" aria-label="Destaques">
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onSelect(i)}
          aria-label={`Destaque ${i + 1} de ${count}`}
          aria-current={i === index ? 'true' : undefined}
          className="grid h-6 w-4 place-items-center"
        >
          <span className={cn('rounded-full bg-primary', small ? 'size-[7px]' : 'size-2')} />
        </button>
      ))}
    </div>
  )
}
