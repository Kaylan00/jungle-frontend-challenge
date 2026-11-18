import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowRight, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { SortOption } from '@/api/contracts'
import { featuredQuery, nftListQuery } from '@/api/queries'
import { EmptyState, ErrorState } from '@/components/shared/error-state'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { announce } from '@/lib/announcer'
import { ART_SIZES, artSources } from '@/lib/art'
import { compareEth } from '@/lib/eth'
import { useIsDesktop } from '@/lib/use-media-query'
import { cn } from '@/lib/utils'
import { ActiveFilters } from './active-filters'
import { CatalogFilters } from './filters'
import { Hero } from './hero'
import { NftCard, NftCardSkeleton } from './nft-card'
import { SearchSuggest } from './search-suggest'
import { activeFilters, CLEAR_FILTERS, PAGE_SIZE, SORT_LABEL, toListParams, type CatalogSearch } from './search-params'

/**
 * Grade do catálogo (lista e skeleton). Mobile (Figma 414): duas colunas, a da direita 32px mais baixa.
 * Desktop: sempre 3 colunas como no Figma (9 por página = 3 linhas cheias); em telas largas os cards e
 * os espaços entre eles crescem na mesma proporção.
 */
const CATALOG_GRID =
  'grid grid-cols-2 gap-x-4 gap-y-[22px] pb-8 max-md:[&>li:nth-child(even)]:translate-y-8 md:gap-y-8 md:pb-0 lg:grid-cols-3 lg:gap-x-7 xl:gap-x-[34px] xl:gap-y-[66px] wide:gap-x-[calc(34*var(--u))] wide:gap-y-[calc(66*var(--u))]'

const TABS: Array<{ label: string; sort: SortOption | undefined }> = [
  { label: 'Todos os NFTs', sort: undefined },
  { label: 'Novos lançamentos', sort: 'recent' },
  { label: 'Em alta', sort: 'popular' },
]

export function HomePage({ search }: { search: CatalogSearch }) {
  const isDesktop = useIsDesktop()
  return (
    <>
      {!isDesktop && <MobileCatalogBar search={search} />}
      <Hero />
      <Catalog search={search} />
      <PromoBanners />
      <Journal />
    </>
  )
}

/**
 * Atualiza a URL do catálogo. Qualquer filtro novo volta para a página 1.
 * A página não rola: filtros, busca, abas e paginação só trocam o conteúdo da grade (o #catalogo fica na
 * URL para quem recarrega ou compartilha o link, mas sem levar a tela até ele a cada clique ou tecla).
 */
function useCatalogUpdate() {
  const navigate = useNavigate()
  return (patch: Partial<CatalogSearch>, opts: { keepPage?: boolean } = {}) =>
    navigate({
      to: '/',
      search: (prev) => ({ ...prev, ...patch, page: opts.keepPage ? patch.page : undefined }),
      hash: 'catalogo',
      resetScroll: false,
      hashScrollIntoView: false,
    })
}

/**
 * Termo de busca com debounce: digitar não dispara uma requisição por tecla.
 * O campo só copia a URL quando ela muda por fora (etiqueta removida, voltar do navegador, "Limpar"):
 * a URL que este próprio campo gravou não volta para ele, senão o eco de "golden" apagaria o espaço de
 * "golden " ou as letras digitadas enquanto a navegação acontecia.
 */
function useSearchTerm(search: CatalogSearch, update: ReturnType<typeof useCatalogUpdate>) {
  const [term, setTerm] = useState(search.q ?? '')
  const pushed = useRef(search.q ?? '')
  useEffect(() => {
    const q = search.q ?? ''
    if (q === pushed.current) return
    pushed.current = q
    setTerm(q)
  }, [search.q])
  useEffect(() => {
    const next = term.trim()
    if ((search.q ?? '') === next) return
    const t = setTimeout(() => {
      pushed.current = next
      void update({ q: next || undefined })
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term])
  return [term, setTerm] as const
}

/**
 * Altura mínima da área de resultados: a de uma página cheia (3 linhas no desktop) medida na própria tela.
 * Enquanto se digita ou filtra, a grade não encolhe e cresce de novo a cada resultado (a página não pula).
 * Nada muda quando a página está cheia: a altura mínima é a altura que a grade já tem.
 */
function useStableResultsHeight() {
  const ref = useRef<HTMLDivElement>(null)
  const [minHeight, setMinHeight] = useState(0)
  useEffect(() => {
    const box = ref.current
    if (!box) return
    let width = 0
    const measure = () => {
      const grid = box.querySelector<HTMLElement>(':scope > ul')
      const w = Math.round(box.clientWidth)
      const full = grid && grid.children.length >= PAGE_SIZE
      if (full) setMinHeight(grid.offsetHeight)
      // Largura nova sem uma página cheia para medir: a medida antiga não vale mais.
      else if (w !== width) setMinHeight(0)
      width = w
    }
    const ro = new ResizeObserver(measure)
    ro.observe(box)
    const mo = new MutationObserver(measure)
    mo.observe(box, { childList: true, subtree: true })
    return () => {
      ro.disconnect()
      mo.disconnect()
    }
  }, [])
  return [ref, minHeight] as const
}

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
  const navigate = useNavigate()
  const update = useCatalogUpdate()
  const [term, setTerm] = useSearchTerm(search, update)
  // Mesma consulta do catálogo (mesma chave = mesmo cache): só para as contagens dos filtros.
  const list = useQuery(nftListQuery(toListParams(search)))
  // Mesma contagem das etiquetas de filtros ativos abaixo das abas (a busca conta como um filtro).
  const activeCount = activeFilters(search).length
  return (
    <div className="container-page flex items-center gap-2 pt-10 md:hidden">
      {/* A lista abaixo já filtra enquanto digita; as sugestões levam direto ao NFT. */}
      <label htmlFor="mobile-search" className="sr-only">
        Buscar coleções e NFTs
      </label>
      <SearchSuggest
        id="mobile-search"
        type="search"
        value={term}
        onValueChange={setTerm}
        onPick={(nft) => void navigate({ to: '/nft/$nftId', params: { nftId: nft.id } })}
        // Enter sem sugestão: fecha o painel e mostra a lista já filtrada (fecha o teclado virtual).
        onSubmitTerm={() => (document.activeElement as HTMLElement | null)?.blur()}
        placeholder="Explorar coleções"
        className="flex-1"
        inputClassName="h-[45px] w-full rounded-[8px] bg-card pl-[42px] pr-3 text-[14px] font-medium placeholder:text-[#b39463]"
        leading={
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
        }
      />
      <Sheet>
        <SheetTrigger asChild>
          <button
            type="button"
            className="relative grid size-[45px] shrink-0 place-items-center rounded-[10px] bg-[linear-gradient(135deg,#8a5a32,#bb7b45)] text-[#2a1a10] transition-[filter] hover:brightness-110"
            aria-label={`Filtros${activeCount ? `, ${activeCount} ${activeCount === 1 ? 'ativo' : 'ativos'}` : ''}`}
          >
            <FiltersIcon />
            {activeCount > 0 && (
              <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-foreground px-1 text-[10px] tabular-nums text-background" data-testid="filters-count">
                {activeCount}
              </span>
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
  // Caixa de filtros lateral e ordenação ao lado das abas só no desktop (no mobile ficam na folha de filtros
  // da barra do topo). Escondidas com CSS elas ainda montavam boa parte da página e os sliders e checkboxes do
  // Radix eram medidos na carga, sem nunca aparecer.
  const isDesktop = useIsDesktop()

  const activeTab = TABS.findIndex((t) => t.sort === search.sort)
  const hasFilters = activeFilters(search).length > 0
  const tablistRef = useRef<HTMLDivElement>(null)
  const [resultsRef, resultsMinHeight] = useStableResultsHeight()
  const clearFilters = () => {
    announce('Todos os filtros foram removidos.')
    void update(CLEAR_FILTERS)
  }

  // Chave da grade: muda quando chega o resultado de outra consulta (filtro, aba, ordenação, página) ou, na
  // busca por nome, quando a lista de NFTs muda. A grade nova é montada de novo e os cards entram em cascata
  // (camada de movimento, data-reveal-group). Enquanto a consulta nova carrega, a grade antiga continua na tela.
  const shownKey = `${JSON.stringify({ ...params, q: undefined })}|${list.data?.items.map((n) => n.id).join(',') ?? ''}`
  const [gridKey, setGridKey] = useState(shownKey)
  if (list.data && !list.isPlaceholderData && gridKey !== shownKey) setGridKey(shownKey)

  // Preço alterado ao vivo (outra aba, painel): o card é atualizado no cache sem nova consulta. Se ele saiu
  // da faixa de preço filtrada, a lista é buscada de novo para não mostrar um NFT fora do filtro.
  const outOfRange = list.data?.items.some(
    (n) => (params.minPrice !== undefined && compareEth(n.price, params.minPrice) < 0) || (params.maxPrice !== undefined && compareEth(n.price, params.maxPrice) > 0),
  )
  const refetchList = list.refetch
  useEffect(() => {
    if (outOfRange) void refetchList()
  }, [outOfRange, refetchList])

  return (
    <section id="catalogo" aria-labelledby="catalogo-title" className="container-page mt-[14px] scroll-mt-20 md:mt-24">
      <h2 id="catalogo-title" className="sr-only">
        Catálogo de NFTs
      </h2>

      <div className="grid gap-10 md:grid-cols-[240px_1fr] xl:grid-cols-[310px_1fr] xl:gap-12 wide:grid-cols-[calc(310*var(--u))_1fr] wide:gap-[calc(48*var(--u))]">
        {isDesktop && (
          <aside className="hidden md:block" aria-label="Filtros do catálogo">
            <div className="mt-px bg-card px-5 pb-5 pt-[15px]">
              {/* A busca por nome não aparece no Figma desktop; fica no topo da caixa de filtros, acima de "Coleções". */}
              <label className="relative mb-5 block">
                <span className="sr-only">Buscar NFTs por nome</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <input
                  type="search"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder="Buscar por nome"
                  autoComplete="off"
                  className="h-10 w-full rounded-[4px] bg-band pl-9 pr-2 text-[15px] placeholder:text-[#b19362]"
                  data-testid="catalog-search"
                />
              </label>
              <CatalogFilters search={search} facets={list.data?.facets} onChange={(p) => void update(p)} />
              {hasFilters && (
                <button type="button" className="mt-4 pl-3 text-[15px] text-highlight underline-offset-4 hover:underline" onClick={clearFilters}>
                  Limpar filtros
                </button>
              )}
            </div>
            <FeaturedBox />
          </aside>
        )}

        {/* min-w-0: a linha de etiquetas rola por dentro no mobile, sem alargar a coluna. */}
        <div className="min-w-0">
          {/* Mobile (Figma 414): abas de 14px, a ativa em #E89B55 com sublinhado laranja, 6px abaixo do texto
              (o espaço extra sai da margem de baixo: a grade fica no mesmo lugar). Abaixo de 390px as três
              não cabem em 14px: vão para 13px; se ainda faltar espaço (fonte do sistema aumentada), a
              fileira rola de lado sem barra visível. */}
          <div className="mb-[10px] flex flex-wrap items-start justify-between gap-3 md:mb-[26px]">
            <div
              ref={tablistRef}
              role="tablist"
              aria-label="Seleção do catálogo"
              className="flex max-w-full gap-[10px] overflow-x-auto text-[13px] leading-5 [scrollbar-width:none] min-[390px]:text-[14px] md:gap-[21px] md:text-[15px] [&::-webkit-scrollbar]:hidden"
            >
              {TABS.map((t, i) => {
                const selected = i === (activeTab === -1 ? (search.sort ? -1 : 0) : activeTab)
                return (
                  <button
                    key={t.label}
                    role="tab"
                    aria-selected={selected}
                    className={cn(
                      'shrink-0 whitespace-nowrap border-b-2 border-transparent pb-[6px] transition-colors duration-200 hover:border-primary/40 hover:text-highlight md:pb-0.5',
                      selected && 'border-primary text-highlight hover:border-primary max-md:font-semibold',
                    )}
                    onClick={() => void update({ sort: t.sort })}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>
            {isDesktop && <SortSelect value={search.sort} onChange={(sort) => void update({ sort })} className="hidden md:flex" />}
          </div>

          {/* Filtros aplicados (só aparece com algum filtro; a grade não se move quando não há nenhum). */}
          <ActiveFilters
            search={search}
            onRemove={(f) => void update(f.patch)}
            onClear={() => void update(CLEAR_FILTERS)}
            focusFallback={() => {
              const tabs = tablistRef.current
              ;(tabs?.querySelector<HTMLElement>('[aria-selected="true"]') ?? tabs?.querySelector<HTMLElement>('[role="tab"]'))?.focus()
            }}
            className="mb-[18px] mt-1 md:-mt-2.5 md:mb-[26px]"
          />

          <div aria-live="polite" className="sr-only" data-testid="results-summary">
            {list.data ? `${list.data.total} NFTs encontrados. Página ${list.data.page} de ${list.data.totalPages}.` : ''}
          </div>

          {/* Altura mínima estável (ver useStableResultsHeight): a página não encolhe nem pula enquanto a busca e os filtros carregam. */}
          <div ref={resultsRef} style={resultsMinHeight ? { minHeight: resultsMinHeight } : undefined}>
            {list.isError && !list.data ? (
              <ErrorState
                title="Não foi possível carregar o catálogo"
                message={list.error.message}
                onRetry={() => void list.refetch()}
                retrying={list.isFetching}
              />
            ) : list.isPending ? (
              // Mesma grade da lista (inclusive a coluna da direita 32px abaixo no mobile): sem pulo ao carregar.
              <ul className={CATALOG_GRID} aria-busy="true" aria-label="Carregando NFTs" data-testid="catalog-loading">
                {Array.from({ length: PAGE_SIZE }, (_, i) => (
                  <li key={i}>
                    <NftCardSkeleton />
                  </li>
                ))}
              </ul>
            ) : list.data.items.length === 0 ? (
              <EmptyState
                title="Nenhum NFT encontrado"
                message="Tente outra busca ou remova alguns filtros."
                action={
                  <Button variant="outline" onClick={() => void navigate({ to: '/', search: {}, hash: 'catalogo', resetScroll: false, hashScrollIntoView: false })}>
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
                  key={gridKey}
                  className={cn(CATALOG_GRID, 'transition-opacity duration-200', list.isPlaceholderData && 'opacity-60')}
                  aria-busy={list.isFetching}
                  data-testid="catalog-grid"
                  data-reveal-group
                >
                  {list.data.items.map((nft, i) => (
                    <li key={nft.id}>
                      <NftCard nft={nft} priority={i < 3} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {/* Enquanto a primeira página carrega, a paginação já ocupa o seu lugar (o catálogo tem várias páginas). */}
          {list.isPending && !list.isError && (
            <div aria-hidden="true" className="mt-[76px] flex justify-end gap-2">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="size-[35px] rounded-[4px]" />
              ))}
            </div>
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
        'grid size-[35px] place-items-center rounded-[4px] border border-[#3f2319] text-xl transition-[color,background-color,border-color,scale] duration-200 hover:border-primary hover:bg-primary/15 hover:text-highlight disabled:opacity-40 disabled:hover:border-[#3f2319] disabled:hover:bg-transparent',
        current && 'border-primary bg-primary text-primary-foreground hover:bg-primary-hover hover:text-primary-foreground',
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
      <p className="pl-[19px] pt-6 text-2xl font-bold uppercase leading-8 text-highlight wide:pl-[calc(19*var(--u))]">NFT em destaque</p>
      <p className="mt-2.5 text-center text-[22px] font-bold uppercase leading-7">Oferta limitada</p>
      {nft ? (
        <Link to="/nft/$nftId" params={{ nftId: nft.id }} className="group mt-2.5 block overflow-hidden rounded-[18px]" aria-label={`NFT em destaque: ${nft.name}`}>
          <img
            {...artSources(nft.image, ART_SIZES.featuredBox)}
            alt=""
            width={310}
            height={366}
            loading="lazy"
            className="aspect-[310/366] w-full rounded-[18px] object-cover transition-[scale,filter] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.03] group-hover:brightness-110"
          />
        </Link>
      ) : (
        <Skeleton className="mt-2.5 aspect-[310/366] w-full rounded-[18px]" />
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
      pad: 'pr-4 xl:pr-[30px] wide:pr-[calc(30*var(--u))]',
    },
    {
      title: ['Arte digital selecionada', 'e muito mais'],
      text: ['Explore novos artistas,', 'coleções verificadas e obras', 'digitais que definem a cultura.'],
      nft: data?.items[2],
      pad: 'pr-4 xl:pr-[35px] wide:pr-[calc(35*var(--u))]',
    },
  ]
  return (
    // Mobile: cada cartão cresce com o texto (16px no título, 13px no texto) e o botão fica inteiro no pé do
    // cartão; a arte tem 160px como no Figma 414 e encolhe até 124px em 360. A partir de md, as medidas do Figma desktop.
    // Telas largas: o cartão inteiro é ampliado como no Figma (arte 286x250 encostada à esquerda, texto logo
    // ao lado alinhado à direita), com o bloco de texto centralizado na altura maior.
    <section aria-label="Destaques da Kurio" className="container-page mt-16 grid gap-6 md:mt-24 md:grid-cols-2 xl:gap-[30px] wide:gap-[calc(30*var(--u))]" data-reveal-group>
      {banners.map((b) => (
        <article
          key={b.title[0]}
          className="grid min-h-[250px] grid-cols-[clamp(124px,calc(100%_-_206px),160px)_1fr] md:h-[250px] md:grid-cols-[130px_1fr] lg:grid-cols-[200px_1fr] xl:grid-cols-[286px_1fr] wide:h-[calc(250*var(--u))] wide:grid-cols-[calc(286*var(--u))_1fr]"
        >
          {/* A arte tem cantos de 12px e fica por cima da caixa marrom (os cantos da esquerda mostram o fundo da página). */}
          <div className="relative z-10 h-full overflow-hidden rounded-xl bg-secondary">
            {b.nft ? (
              <img {...artSources(b.nft.image, ART_SIZES.banner)} alt="" width={286} height={250} loading="lazy" className="size-full object-cover" />
            ) : (
              <Skeleton className="size-full rounded-none" />
            )}
          </div>
          <div className={cn('-ml-3 flex flex-col items-end rounded-r-[4px] bg-card pb-5 pl-4 pt-5 text-right md:pb-0 md:pt-[37px] wide:justify-center wide:pb-[9px] wide:pt-0', b.pad)}>
            <h2 className="text-[16px] font-bold leading-[22px] md:text-lg md:leading-6">
              {b.title.map((line, i) => (
                <span key={line} className="xl:block xl:whitespace-nowrap">
                  {line}
                  {i < b.title.length - 1 && ' '}
                </span>
              ))}
            </h2>
            <p className="mb-4 mt-2 text-[13px] leading-5 text-muted-foreground md:mb-0 md:mt-[9px] md:text-sm md:leading-6">
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
              className="mt-auto inline-flex h-10 w-[124px] shrink-0 items-center justify-center gap-1 rounded-[4px] bg-primary text-sm text-primary-foreground transition-[background-color,box-shadow,scale,gap] duration-200 hover:gap-2 hover:bg-primary-hover hover:shadow-[0_6px_20px_-8px_rgba(223,154,94,0.75)] active:scale-[0.97] md:-mt-0.5 md:w-[140px]"
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
      {/* Figma: 4 cards de 268px com 24px entre eles, alinhados à esquerda do container (sobram 56px à
          direita em 1200). Em telas largas cards, espaços e sobra crescem na mesma proporção. */}
      <div data-reveal-group className="mt-[39px] grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-6 xl:grid-cols-[repeat(4,268px)] wide:grid-cols-[repeat(4,calc(268*var(--u)))] wide:gap-[calc(24*var(--u))]">
        {ARTICLES.map((a) => (
          <article key={a.title} className="overflow-hidden rounded-md bg-card">
            <img {...artSources(a.img, ART_SIZES.journal)} alt="" width={268} height={195} loading="lazy" className="aspect-[268/195] w-full object-cover" />
            <div className="px-4 pb-[15px] pt-3 wide:px-[calc(16*var(--u))]">
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
