import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowRight, ChevronLeft, ChevronRight, Search, SlidersHorizontal } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { SortOption } from '@/api/contracts'
import { featuredQuery, nftListQuery } from '@/api/queries'
import { EmptyState, ErrorState } from '@/components/shared/error-state'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { CatalogFilters } from './filters'
import { Hero } from './hero'
import { NftCard, NftCardSkeleton } from './nft-card'
import { PAGE_SIZE, SORT_LABEL, toListParams, type CatalogSearch } from './search-params'

const TABS: Array<{ label: string; sort: SortOption | undefined }> = [
  { label: 'Todos os NFTs', sort: undefined },
  { label: 'Novos lançamentos', sort: 'recent' },
  { label: 'Em alta', sort: 'popular' },
]

export function HomePage({ search }: { search: CatalogSearch }) {
  return (
    <>
      <Hero />
      <Catalog search={search} />
      <PromoBanners />
      <Journal />
    </>
  )
}

function Catalog({ search }: { search: CatalogSearch }) {
  const navigate = useNavigate()
  const params = toListParams(search)
  // A chave da consulta inclui todos os parâmetros: resposta atrasada de outra busca nunca
  // aparece aqui; o signal do Axios cancela a requisição que ficou obsoleta.
  const list = useQuery(nftListQuery(params))
  const page = list.data?.page ?? params.page ?? 1
  const totalPages = list.data?.totalPages ?? 1

  /** Atualiza a URL. Qualquer filtro novo volta para a página 1. */
  const update = (patch: Partial<CatalogSearch>, opts: { keepPage?: boolean } = {}) =>
    navigate({
      to: '/',
      search: (prev) => ({ ...prev, ...patch, page: opts.keepPage ? patch.page : undefined }),
      hash: 'catalogo',
      resetScroll: false,
    })

  const [term, setTerm] = useState(search.q ?? '')
  useEffect(() => setTerm(search.q ?? ''), [search.q])
  // Busca com debounce: digitar não dispara uma requisição por tecla.
  useEffect(() => {
    if ((search.q ?? '') === term.trim()) return
    const t = setTimeout(() => void update({ q: term.trim() || undefined }), 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term])

  const activeTab = TABS.findIndex((t) => t.sort === search.sort)
  const activeFilters = (search.category?.length ?? 0) + (search.network?.length ?? 0) + (search.minPrice || search.maxPrice ? 1 : 0) + (search.onlyAvailable ? 1 : 0)

  return (
    <section id="catalogo" aria-labelledby="catalogo-title" className="container-page mt-10 scroll-mt-20 md:mt-16">
      <h2 id="catalogo-title" className="sr-only">
        Catálogo de NFTs
      </h2>

      {/* Busca + filtros (mobile: barra de busca e botão de filtros como no Figma) */}
      <div className="mb-5 flex items-center gap-2 md:hidden">
        <label className="relative flex-1">
          <span className="sr-only">Buscar coleções e NFTs</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Explorar coleções"
            className="h-10 w-full rounded-lg bg-card pl-9 pr-3 text-sm"
          />
        </label>
        <Sheet>
          <SheetTrigger asChild>
            <Button size="icon" className="relative size-10" aria-label={`Filtros${activeFilters ? `, ${activeFilters} ativos` : ''}`}>
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              {activeFilters > 0 && <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-foreground text-[10px] text-background">{activeFilters}</span>}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-card p-5">
            <SheetHeader className="p-0">
              <SheetTitle>Filtros</SheetTitle>
              <SheetDescription>Os filtros se combinam e atualizam a lista na hora.</SheetDescription>
            </SheetHeader>
            <CatalogFilters search={search} facets={list.data?.facets} onChange={(p) => void update(p)} idPrefix="m" />
            <SortSelect value={search.sort} onChange={(sort) => void update({ sort })} className="mt-6 w-full" />
          </SheetContent>
        </Sheet>
      </div>

      <div className="grid gap-10 md:grid-cols-[240px_1fr] lg:grid-cols-[254px_1fr]">
        <aside className="hidden md:block" aria-label="Filtros do catálogo">
          <div className="rounded-md bg-card p-4">
            <div className="mb-4 hidden md:block">
              <label className="relative block">
                <span className="sr-only">Buscar NFTs</span>
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <input
                  type="search"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder="Buscar por nome"
                  className="h-9 w-full rounded-md bg-secondary pl-8 pr-2 text-[13px]"
                  data-testid="catalog-search"
                />
              </label>
            </div>
            <CatalogFilters search={search} facets={list.data?.facets} onChange={(p) => void update(p)} />
            {activeFilters > 0 && (
              <button type="button" className="mt-5 text-[13px] text-primary underline-offset-4 hover:underline" onClick={() => void navigate({ to: '/', search: {}, hash: 'catalogo', resetScroll: false })}>
                Limpar filtros
              </button>
            )}
          </div>
          <FeaturedBox />
        </aside>

        <div>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div role="tablist" aria-label="Seleção do catálogo" className="flex gap-4 overflow-x-auto text-[14px] md:gap-5">
              {TABS.map((t, i) => {
                const selected = i === (activeTab === -1 ? (search.sort ? -1 : 0) : activeTab)
                return (
                  <button
                    key={t.label}
                    role="tab"
                    aria-selected={selected}
                    className={cn('shrink-0 border-b-2 border-transparent pb-1 transition-colors hover:text-primary', selected && 'border-primary text-primary')}
                    onClick={() => void update({ sort: t.sort })}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>
            <SortSelect value={search.sort} onChange={(sort) => void update({ sort })} className="hidden md:flex" />
          </div>

          <div aria-live="polite" className="sr-only" data-testid="results-summary">
            {list.data ? `${list.data.total} NFTs encontrados. Página ${list.data.page} de ${list.data.totalPages}.` : ''}
          </div>

          {list.isError && !list.data ? (
            <ErrorState
              title="Não foi possível carregar o catálogo"
              message={list.error.message}
              onRetry={() => void list.refetch()}
              retrying={list.isFetching}
            />
          ) : list.isPending ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-3 lg:gap-x-7" aria-busy="true" aria-label="Carregando NFTs" data-testid="catalog-loading">
              {Array.from({ length: PAGE_SIZE }, (_, i) => (
                <NftCardSkeleton key={i} />
              ))}
            </div>
          ) : list.data.items.length === 0 ? (
            <EmptyState
              title="Nenhum NFT encontrado"
              message="Tente outra busca ou remova alguns filtros."
              action={
                <Button variant="outline" onClick={() => void navigate({ to: '/', search: {}, hash: 'catalogo', resetScroll: false })}>
                  Limpar busca e filtros
                </Button>
              }
            />
          ) : (
            <>
              {list.isError && (
                <ErrorState className="mb-4 py-4" title="Falha ao atualizar a lista" message={list.error.message} onRetry={() => void list.refetch()} retrying={list.isFetching} />
              )}
              <ul
                className={cn('grid grid-cols-2 gap-x-4 gap-y-8 transition-opacity lg:grid-cols-3 lg:gap-x-7', list.isPlaceholderData && 'opacity-60')}
                aria-busy={list.isFetching}
                data-testid="catalog-grid"
              >
                {list.data.items.map((nft, i) => (
                  <li key={nft.id}>
                    <NftCard nft={nft} priority={i < 3} />
                  </li>
                ))}
              </ul>
            </>
          )}

          {totalPages > 1 && (
            <nav aria-label="Paginação do catálogo" className="mt-10 flex justify-end gap-2">
              <PageButton disabled={page <= 1} onClick={() => void update({ page: page - 1 }, { keepPage: true })} label="Página anterior">
                <ChevronLeft className="size-4" aria-hidden="true" />
              </PageButton>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <PageButton key={n} current={n === page} onClick={() => void update({ page: n === 1 ? undefined : n }, { keepPage: true })} label={`Página ${n}`}>
                  {n}
                </PageButton>
              ))}
              <PageButton disabled={page >= totalPages} onClick={() => void update({ page: page + 1 }, { keepPage: true })} label="Próxima página">
                <ChevronRight className="size-4" aria-hidden="true" />
              </PageButton>
            </nav>
          )}
        </div>
      </div>
    </section>
  )
}

function PageButton({ children, current, disabled, onClick, label }: { children: React.ReactNode; current?: boolean; disabled?: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'grid size-8 place-items-center rounded-sm border border-border text-[13px] transition-colors hover:border-primary disabled:opacity-40',
        current && 'border-primary bg-primary font-bold text-primary-foreground',
      )}
    >
      {children}
    </button>
  )
}

function SortSelect({ value, onChange, className }: { value: SortOption | undefined; onChange: (v: SortOption | undefined) => void; className?: string }) {
  return (
    <div className={cn('items-center gap-1 text-[14px]', className)}>
      <span id="sort-label">Ordenar por:</span>
      <Select value={value ?? 'relevance'} onValueChange={(v) => onChange(v === 'relevance' ? undefined : (v as SortOption))}>
        <SelectTrigger aria-labelledby="sort-label" className="h-8 border-0 bg-transparent px-1 text-[14px] shadow-none focus-visible:ring-2" data-testid="sort-select">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(SORT_LABEL) as SortOption[]).map((s) => (
            <SelectItem key={s} value={s}>
              {SORT_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function FeaturedBox() {
  const { data } = useQuery(featuredQuery)
  const nft = data?.items[1]
  return (
    <div className="mt-6 overflow-hidden rounded-md bg-gradient-to-b from-band to-card">
      <p className="px-4 pt-4 text-lg font-bold uppercase text-primary">NFT em destaque</p>
      <p className="px-4 pb-3 text-center text-[15px] font-bold uppercase">Oferta limitada</p>
      {nft ? (
        <Link to="/nft/$nftId" params={{ nftId: nft.id }} className="block" aria-label={`NFT em destaque: ${nft.name}`}>
          <img src={nft.image} alt="" width={254} height={254} loading="lazy" className="aspect-[254/300] w-full rounded-xl object-cover" />
        </Link>
      ) : (
        <div className="aspect-[254/300] w-full" />
      )}
    </div>
  )
}

function PromoBanners() {
  const { data } = useQuery(featuredQuery)
  const banners = [
    { title: 'Lançamentos gênesis de edição limitada', text: 'Colecione edições escassas diretamente dos criadores antes da revelação pública.', nft: data?.items[0] },
    { title: 'Arte digital selecionada e muito mais', text: 'Explore novos artistas, coleções verificadas e obras digitais que definem a cultura.', nft: data?.items[2] },
  ]
  return (
    <section aria-label="Destaques da Kurio" className="container-page mt-16 grid gap-6 md:grid-cols-2">
      {banners.map((b) => (
        <article key={b.title} className="grid grid-cols-[160px_1fr] overflow-hidden rounded-md bg-card md:grid-cols-[200px_1fr]">
          <div className="aspect-square bg-secondary">{b.nft && <img src={b.nft.image} alt="" width={200} height={200} loading="lazy" className="size-full object-cover" />}</div>
          <div className="flex flex-col items-end justify-center gap-2 p-4 text-right">
            <h2 className="text-[14px] font-bold leading-snug">{b.title}</h2>
            <p className="text-[12px] leading-relaxed text-muted-foreground">{b.text}</p>
            <Link to="/" hash="catalogo" search={{ sort: 'recent' }} className="mt-1 inline-flex items-center gap-1 rounded-md bg-primary px-4 py-1.5 text-[12px] font-semibold text-primary-foreground hover:bg-primary-hover">
              Explorar <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>
        </article>
      ))}
    </section>
  )
}

const ARTICLES = [
  { date: '12 de setembro', read: '6 min', title: 'Como funciona a propriedade de NFTs', text: 'Aprenda a colecionar, negociar e verificar ativos digitais.', img: '/nfts/ivory.webp' },
  { date: '13 de setembro', read: '2 min', title: '10 artistas digitais para acompanhar', text: 'Conheça criadores que moldam a cultura digital.', img: '/nfts/emerald.webp' },
  { date: '15 de setembro', read: '3 min', title: 'Raridade, atributos e procedência', text: 'Entenda raridade, procedência, direitos autorais e utilidade.', img: '/nfts/sage.webp' },
  { date: '15 de setembro', read: '2 min', title: 'Como proteger sua carteira', text: 'Proteja sua carteira, seus ativos e sua identidade.', img: '/nfts/golden.webp' },
]

/** "Diário da Cunhagem": conteúdo editorial está fora do escopo; os cards não levam a páginas. */
function Journal() {
  return (
    <section aria-labelledby="diario-title" className="container-page mt-20">
      <h2 id="diario-title" className="text-center text-2xl font-bold">
        Diário da Cunhagem
      </h2>
      <p className="mt-2 text-center text-[13px] text-muted-foreground">Histórias, guias e insights para colecionadores sobre o universo da propriedade digital.</p>
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-6">
        {ARTICLES.map((a) => (
          <article key={a.title} className="overflow-hidden rounded-md bg-card">
            <img src={a.img} alt="" width={270} height={180} loading="lazy" className="aspect-[3/2] w-full object-cover" />
            <div className="p-4">
              <p className="text-[11px] text-muted-foreground">
                {a.date} | Leitura de {a.read}
              </p>
              <h3 className="mt-2 text-[14px] font-bold leading-snug">{a.title}</h3>
              <p className="mt-1 text-[12px] text-muted-foreground">{a.text}</p>
              <span className="mt-3 inline-block cursor-not-allowed text-[12px] text-subtle-foreground" title="Conteúdo editorial em breve">
                Ler mais (em breve)
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
