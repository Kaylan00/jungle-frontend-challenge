import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { featuredQuery } from '@/api/queries'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/** Destaques: NFTs marcados como featured pela API, alternados pelos pontos do carrossel. */
export function Hero() {
  const { data, isPending } = useQuery(featuredQuery)
  const items = data?.items.slice(0, 3) ?? []
  const [index, setIndex] = useState(0)
  const current = items[index]

  return (
    <section aria-labelledby="hero-title" className="container-page">
      {/* Desktop (Figma 1440: arte 450x450 em x=870, texto em x=160) */}
      <div className="hidden grid-cols-[1fr_450px] gap-10 pt-8 md:grid">
        <div className="pt-[39px] md:pl-4 xl:pl-10">
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
          <Dots count={items.length || 3} index={index} onSelect={setIndex} className="mt-9 xl:ml-[556px]" />
        </div>
        <div className="relative aspect-square w-[450px]">
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

      {/* Mobile (Figma: cartão compacto com duas artes sobrepostas) */}
      <div className="relative mt-3 overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_70%_30%,#6b4128,#3a2214_70%)] p-4 md:hidden">
        <div className="grid grid-cols-[1fr_120px] gap-3">
          <div>
            <p className="text-[11px] font-medium">Bem-vindo à Kurio</p>
            <h1 className="mt-1 text-lg font-bold uppercase leading-snug">Seja dono da cultura digital</h1>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">Descubra NFTs selecionados de criadores do mundo todo.</p>
            <Link to="/" hash="catalogo" className="mt-2 inline-flex items-center gap-1 text-[12px] font-bold uppercase text-primary">
              Explorar <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>
          <div className="relative h-[120px]">
            {current ? (
              <img src={current.image} alt="" width={120} height={120} className="size-[120px] rounded-xl object-cover" />
            ) : (
              <Skeleton className="size-[120px] rounded-xl" />
            )}
            {items[1] && <img src={items[1].image} alt="" width={52} height={52} className="absolute -bottom-2 left-0 size-[52px] rounded-lg border-2 border-[#3a2214] object-cover" />}
          </div>
        </div>
        <Dots count={items.length || 3} index={index} onSelect={setIndex} className="mt-3 justify-center" />
      </div>
    </section>
  )
}

function Dots({ count, index, onSelect, className }: { count: number; index: number; onSelect: (i: number) => void; className?: string }) {
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
          <span className="size-2 rounded-full bg-primary" />
        </button>
      ))}
    </div>
  )
}
