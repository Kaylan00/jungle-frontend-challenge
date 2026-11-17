import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowRight, ChevronLeft, ChevronRight, Search } from 'lucide-react'
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
      <MobileCatalogBar search={search} />
      <Hero />
      <Catalog search={search} />
      <PromoBanners />
      <Journal />
    </>
  )
}

/** Atualiza a URL do catálogo. Qualquer filtro novo volta para a página 1. */
function useCatalogUpdate() {
  const navigate = useNavigate()
  return (patch: Partial<CatalogSearch>, opts: { keepPage?: boolean } = {}) =>
    navigate({
      to: '/',
      search: (prev) => ({ ...prev, ...patch, page: opts.keepPage ? patch.page : undefined }),
      hash: 'catalogo',
      resetScroll: false,
    })
}

/** Termo de busca com debounce: digitar não dispara uma requisição por tecla. */
function useSearchTerm(search: CatalogSearch, update: ReturnType<typeof useCatalogUpdate>) {
  const [term, setTerm] = useState(search.q ?? '')
  useEffect(() => setTerm(search.q ?? ''), [search.q])
  useEffect(() => {
    if ((search.q ?? '') === term.trim()) return
    const t = setTimeout(() => void update({ q: term.trim() || undefined }), 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term])
  return [term, setTerm] as const
}

const countActiveFilters = (search: CatalogSearch) =>
  (search.category?.length ?? 0) + (search.network?.length ?? 0) + (search.minPrice || search.maxPrice ? 1 : 0) + (search.onlyAvailable ? 1 : 0)

/** Ícone de filtros do Figma mobile: duas linhas com um círculo em cada ponta. */
function FiltersIcon() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <circle cx="5" cy="5.5" r="2.6" />
      <path d="M10 5.5h8" />
      <circle cx="15" cy="14.5" r="2.6" />
      <path d="M2 14.5h8" />
    </svg>
  )
}

/** Mobile (Figma 414): busca "Explorar coleções" e botão de filtros no topo, acima do destaque. */
function MobileCatalogBar({ search }: { search: CatalogSearch }) {
  const update = useCatalogUpdate()
  const [term, setTerm] = useSearchTerm(search, update)
  // Mesma consulta do catálogo (mesma chave = mesmo cache): só para as contagens dos filtros.
  const list = useQuery(nftListQuery(toListParams(search)))
  const activeFilters = countActiveFilters(search)
  return (
    <div className="container-page flex items-center gap-2 pt-10 md:hidden">
      <label className="relative flex-1">
        <span className="sr-only">Buscar coleções e NFTs</span>
        <svg
          viewBox="0 0 22 22"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          aria-hidden="true"
          className="pointer-events-none absolute left-[13px] top-1/2 -translate-y-1/2 text-[#b39463]"
        >
          <circle cx="10" cy="10" r="8.2" />
          <path d="M16 16l4.4 4.4" />
        </svg>
        <input
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Explorar coleções"
          className="h-[45px] w-full rounded-[8px] bg-card pl-[42px] pr-3 text-[14px] font-medium placeholder:text-[#b39463]"
        />
      </label>
      <Sheet>
        <SheetTrigger asChild>
          <button
            type="button"
            className="relative grid size-[45px] shrink-0 place-items-center rounded-[10px] bg-[linear-gradient(135deg,#8a5a32,#bb7b45)] text-[#2a1a10] transition-[filter] hover:brightness-110"
            aria-label={`Filtros${activeFilters ? `, ${activeFilters} ativos` : ''}`}
          >
            <FiltersIcon />
            {activeFilters > 0 && (
              <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-foreground text-[10px] text-background">{activeFilters}</span>
            )}
          </button>
        </SheetTrigger>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-card p-5">
          <SheetHeader className="p-0">
            <SheetTitle>Filtros</SheetTitle>
            <SheetDescription>Os filtros se combinam e atualizam a lista na hora.</SheetDescription>
          </SheetHeader>
          <CatalogFilters search={search} facets={list.data?.facets} onChange={(p) => void update(p)} idPrefix="m" />
          <SortSelect value={search.sort} onChange={(sort) => void update({ sort })} className="mt-6 flex w-full" />
        </SheetContent>
      </Sheet>
    </div>
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
  const update = useCatalogUpdate()
  const [term, setTerm] = useSearchTerm(search, update)

  const activeTab = TABS.findIndex((t) => t.sort === search.sort)
  const activeFilters = countActiveFilters(search)

  return (
    <section id="catalogo" aria-labelledby="catalogo-title" className="container-page mt-[14px] scroll-mt-20 md:mt-24">
      <h2 id="catalogo-title" className="sr-only">
        Catálogo de NFTs
      </h2>

      <div className="grid gap-10 md:grid-cols-[240px_1fr] xl:grid-cols-[310px_1fr] xl:gap-12">
        <aside className="hidden md:block" aria-label="Filtros do catálogo">
          <div className="mt-px bg-card px-5 pb-5 pt-[15px]">
            <CatalogFilters search={search} facets={list.data?.facets} onChange={(p) => void update(p)} />
            {/* A busca por nome não aparece no Figma desktop; fica no fim da caixa de filtros. */}
            <label className="relative mt-3 block">
              <span className="sr-only">Buscar NFTs por nome</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                type="search"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Buscar por nome"
                className="h-10 w-full rounded-[4px] bg-band pl-9 pr-2 text-[15px] placeholder:text-[#b19362]"
                data-testid="catalog-search"
              />
            </label>
            {activeFilters > 0 && (
              <button type="button" className="mt-4 pl-3 text-[15px] text-highlight underline-offset-4 hover:underline" onClick={() => void navigate({ to: '/', search: {}, hash: 'catalogo', resetScroll: false })}>
                Limpar filtros
              </button>
            )}
          </div>
          <FeaturedBox />
        </aside>

        <div>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3 md:mb-[26px]">
            <div role="tablist" aria-label="Seleção do catálogo" className="flex gap-[10px] overflow-x-auto text-[14px] leading-5 md:gap-[21px] md:text-[15px]">
              {TABS.map((t, i) => {
                const selected = i === (activeTab === -1 ? (search.sort ? -1 : 0) : activeTab)
                return (
                  <button
                    key={t.label}
                    role="tab"
                    aria-selected={selected}
                    className={cn('shrink-0 border-b-2 border-transparent transition-colors hover:text-highlight md:pb-0.5', selected && 'border-primary text-highlight max-md:font-semibold')}
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
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-3 lg:gap-x-7 xl:gap-x-[34px] xl:gap-y-[66px]" aria-busy="true" aria-label="Carregando NFTs" data-testid="catalog-loading">
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
                className={cn('grid grid-cols-2 gap-x-4 gap-y-[22px] pb-8 transition-opacity max-md:[&>li:nth-child(even)]:translate-y-8 md:gap-y-8 md:pb-0 lg:grid-cols-3 lg:gap-x-7 xl:gap-x-[34px] xl:gap-y-[66px]', list.isPlaceholderData && 'opacity-60')}
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
            <nav aria-label="Paginação do catálogo" className="mt-[76px] flex justify-end gap-2">
              {/* Figma: na primeira página não há botão de voltar. */}
              {page > 1 && (
                <PageButton onClick={() => void update({ page: page - 1 }, { keepPage: true })} label="Página anterior">
                  <ChevronLeft className="size-5" strokeWidth={1.5} aria-hidden="true" />
                </PageButton>
              )}
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <PageButton key={n} current={n === page} onClick={() => void update({ page: n === 1 ? undefined : n }, { keepPage: true })} label={`Página ${n}`}>
                  {n}
                </PageButton>
              ))}
              <PageButton disabled={page >= totalPages} onClick={() => void update({ page: page + 1 }, { keepPage: true })} label="Próxima página">
                <ChevronRight className="size-5" strokeWidth={1.5} aria-hidden="true" />
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
        'grid size-[35px] place-items-center rounded-[4px] border border-[#3f2319] text-xl transition-colors hover:border-primary disabled:opacity-40',
        current && 'border-primary bg-primary text-primary-foreground',
      )}
    >
      {children}
    </button>
  )
}

function SortSelect({ value, onChange, className }: { value: SortOption | undefined; onChange: (v: SortOption | undefined) => void; className?: string }) {
  return (
    <div className={cn('items-center gap-[9px] text-[15px] leading-5', className)}>
      <span id="sort-label">Ordenar por:</span>
      <Select value={value ?? 'relevance'} onValueChange={(v) => onChange(v === 'relevance' ? undefined : (v as SortOption))}>
        <SelectTrigger aria-labelledby="sort-label" className="h-5 gap-1.5 rounded-sm border-0 bg-transparent p-0 text-[15px] text-foreground shadow-none focus-visible:ring-2 dark:bg-transparent dark:hover:bg-transparent data-[size=default]:h-5 [&_svg:not([class*='text-'])]:text-foreground" data-testid="sort-select">
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
    <div className="mt-6 overflow-hidden bg-gradient-to-b from-[#271910] to-[#1a110c]">
      <p className="pl-[19px] pt-6 text-2xl font-bold uppercase leading-8 text-highlight">NFT em destaque</p>
      <p className="mt-2.5 text-center text-[22px] font-bold uppercase leading-7">Oferta limitada</p>
      {nft ? (
        <Link to="/nft/$nftId" params={{ nftId: nft.id }} className="mt-2.5 block" aria-label={`NFT em destaque: ${nft.name}`}>
          <img src={nft.image} alt="" width={310} height={366} loading="lazy" className="aspect-[310/366] w-full rounded-[18px] object-cover" />
        </Link>
      ) : (
        <div className="mt-2.5 aspect-[310/366] w-full" />
      )}
    </div>
  )
}

function PromoBanners() {
  const { data } = useQuery(featuredQuery)
  // Quebras de linha e respiro à direita como no Figma (cada banner tem a sua caixa de texto).
  const banners = [
    {
      title: ['Lançamentos gênesis', 'de edição limitada'],
      text: ['Colecione edições escassas', 'diretamente dos criadores antes', 'da revelação pública.'],
      nft: data?.items[0],
      pad: 'pr-4 xl:pr-[30px]',
    },
    {
      title: ['Arte digital selecionada', 'e muito mais'],
      text: ['Explore novos artistas,', 'coleções verificadas e obras', 'digitais que definem a cultura.'],
      nft: data?.items[2],
      pad: 'pr-4 xl:pr-[35px]',
    },
  ]
  return (
    <section aria-label="Destaques da Kurio" className="container-page mt-16 grid gap-6 md:mt-24 md:grid-cols-2 xl:gap-[30px]">
      {banners.map((b) => (
        <article key={b.title[0]} className="grid h-[250px] grid-cols-[160px_1fr] md:grid-cols-[130px_1fr] lg:grid-cols-[200px_1fr] xl:grid-cols-[286px_1fr]">
          {/* A arte tem cantos de 12px e fica por cima da caixa marrom (os cantos da esquerda mostram o fundo da página). */}
          <div className="relative z-10 h-full overflow-hidden rounded-xl bg-secondary">
            {b.nft && <img src={b.nft.image} alt="" width={286} height={250} loading="lazy" className="size-full object-cover" />}
          </div>
          <div className={cn('-ml-3 flex flex-col items-end rounded-r-[4px] bg-card pl-4 pt-[37px] text-right', b.pad)}>
            <h2 className="text-lg font-bold leading-6">
              {b.title.map((line, i) => (
                <span key={line} className="xl:block xl:whitespace-nowrap">
                  {line}
                  {i < b.title.length - 1 && ' '}
                </span>
              ))}
            </h2>
            <p className="mt-[9px] leading-6 text-muted-foreground">
              {b.text.map((line, i) => (
                <span key={line} className="xl:block xl:whitespace-nowrap">
                  {line}
                  {i < b.text.length - 1 && ' '}
                </span>
              ))}
            </p>
            <Link
              to="/"
              hash="catalogo"
              search={{ sort: 'recent' }}
              className="-mt-0.5 inline-flex h-10 w-[140px] shrink-0 items-center justify-center gap-1 rounded-[4px] bg-primary text-sm text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              Explorar <ArrowRight className="size-5" strokeWidth={1.75} aria-hidden="true" />
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
    <section aria-labelledby="diario-title" className="container-page mt-20 md:mb-4 md:mt-[97px]">
      <h2 id="diario-title" className="text-center text-[28px] font-bold leading-9">
        Diário da Cunhagem
      </h2>
      <p className="mt-[11px] text-center leading-5 text-muted-foreground">Histórias, guias e insights para colecionadores sobre o universo da propriedade digital.</p>
      {/* Figma: 4 cards de 268px com 24px entre eles, alinhados à esquerda do container. */}
      <div className="mt-[39px] grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-6 xl:grid-cols-[repeat(4,268px)]">
        {ARTICLES.map((a) => (
          <article key={a.title} className="overflow-hidden rounded-md bg-card">
            <img src={a.img} alt="" width={268} height={195} loading="lazy" className="aspect-[268/195] w-full object-cover" />
            <div className="px-4 pb-[15px] pt-3">
              <p className="whitespace-pre-wrap text-xs leading-4 text-muted-foreground">
                {a.date}
                {'  |  '}Leitura de {a.read}
              </p>
              <h3 className="mt-2 text-base font-bold leading-[21px]">{a.title}</h3>
              <p className="mt-2 text-xs leading-4 text-muted-foreground">{a.text}</p>
              <span className="mt-[7px] inline-block cursor-not-allowed text-xs font-bold leading-4 text-highlight" title="Conteúdo editorial em breve">
                Ler mais →<span className="sr-only"> (em breve)</span>
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
