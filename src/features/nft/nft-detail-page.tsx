import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ChevronLeft, Mail, Search, ShoppingCart, Star, ZoomIn } from 'lucide-react'
import { LinkedinIcon, TwitterIcon, XIcon } from '@/components/shared/brand-icons'
import { useState } from 'react'
import type { Edition, NftDetail } from '@/api/contracts'
import { ApiError } from '@/api/http'
import { nftDetailQuery, nftListQuery } from '@/api/queries'
import { NotFound } from '@/components/layout/not-found'
import { ErrorState } from '@/components/shared/error-state'
import { QuantityStepper } from '@/components/shared/quantity-stepper'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useAddToCart, useCart } from '@/features/cart/hooks'
import { NftCard } from '@/features/catalog/nft-card'
import { NETWORK_LABEL } from '@/features/catalog/search-params'
import { FavoriteButton } from '@/features/favorites/favorite-button'
import { ART_SIZES, artSources } from '@/lib/art'
import { useBottomBar } from '@/lib/bottom-bars'
import { formatEth } from '@/lib/eth'
import { FLOW_PAGES, useSmartBack } from '@/lib/back-navigation'
import { usePageTitle } from '@/lib/page-title'
import { cn } from '@/lib/utils'
import { ShareButton } from './share-button'
import { SkeletonLine, VitrineCardSkeleton, VitrineDotsSkeleton } from './vitrine-skeleton'

export function NftDetailPage({ nftId, editionId }: { nftId: string; editionId?: string }) {
  const query = useQuery(nftDetailQuery(nftId))
  const notFound = query.error instanceof ApiError && query.error.code === 'NOT_FOUND'
  // Não encontrado: o título vem do <NotFound />.
  usePageTitle(query.data?.name ?? (query.isPending ? 'Carregando NFT' : notFound ? undefined : 'Erro ao carregar o NFT'))

  if (query.isError) {
    if (notFound) {
      return <NotFound title="NFT não encontrado" description={`Não existe NFT com o identificador “${nftId}”. Ele pode ter sido removido do catálogo.`} />
    }
    return (
      <div className="container-page py-16">
        <ErrorState title="Não foi possível carregar este NFT" message={query.error.message} onRetry={() => void query.refetch()} retrying={query.isFetching} />
      </div>
    )
  }
  if (query.isPending) return <DetailSkeleton />
  return <DetailView nft={query.data} editionId={editionId} />
}

/** Largura de cada elipse de edição no Figma (px); outros nomes ficam do tamanho do texto. */
const EDITION_CHIP_WIDTH: Record<string, number> = { '1/1': 36, '1/10': 42, '1/50': 46, aberta: 66 }

function editionLabel(e: Edition) {
  if (e.status === 'unavailable') return 'indisponível'
  if (e.status === 'sold_out') return 'esgotada'
  return `${e.available} disponíveis`
}

function DetailView({ nft, editionId }: { nft: NftDetail; editionId?: string }) {
  const navigate = useNavigate()
  const goBack = useSmartBack({ fallback: '/', avoid: FLOW_PAGES })
  // Padrão: a edição à venda com o preço exibido no card (o menor); senão a primeira à venda.
  const firstOnSale = nft.editions.find((e) => e.status === 'on_sale' && e.price === nft.price) ?? nft.editions.find((e) => e.status === 'on_sale')
  const edition = nft.editions.find((e) => e.id === editionId) ?? firstOnSale ?? nft.editions[0]
  const { data: cart } = useCart()
  const inCart = cart?.items.find((i) => i.nftId === nft.id && i.editionId === edition.id)?.quantity ?? 0
  const limit = edition.status === 'on_sale' ? Math.max(0, Math.min(edition.available, edition.maxPerOrder) - inCart) : 0
  const [qty, setQty] = useState(1)
  const [image, setImage] = useState(0)
  const [zoom, setZoom] = useState(false)
  const [tab, setTab] = useState<'details' | 'reviews'>('details')
  const add = useAddToCart()
  const buyBarRef = useBottomBar()

  // Se o limite cair (evento de estoque, item no carrinho), a quantidade acompanha. Ajuste durante o render
  // (padrão do React para estado derivado de props): sem efeito, sem um render intermediário com valor inválido.
  const maxQty = Math.max(1, limit)
  if (qty > maxQty) setQty(maxQty)

  const selectEdition = (id: string) => void navigate({ to: '/nft/$nftId', params: { nftId: nft.id }, search: { edicao: id }, replace: true, resetScroll: false })

  const buy = (goToCart: boolean) =>
    add.mutate(
      { nftId: nft.id, editionId: edition.id, quantity: qty },
      {
        onSuccess: () => {
          setQty(1)
          if (goToCart) void navigate({ to: '/carrinho' })
        },
      },
    )

  const unavailableReason = edition.status === 'unavailable' ? 'Esta edição não está à venda.' : edition.status === 'sold_out' ? 'Edição esgotada.' : limit === 0 ? `Você já tem o máximo permitido desta edição no carrinho (${Math.min(edition.available, edition.maxPerOrder)}).` : null

  const network = NETWORK_LABEL[nft.network]

  return (
    <article
      className="container-page pb-28 pt-4 max-md:bg-[linear-gradient(180deg,#251712,#2c1b15_395px,#241612_395px)] max-md:pb-[180px] max-md:pl-7 max-md:pr-[25px] max-md:pt-[23px] md:pb-0 md:pt-6 xl:pb-4 xl:pt-8"
      aria-labelledby="nft-title"
    >
      {/* Mobile (Figma 414): voltar e favoritar em círculos de 35px sobre o topo da arte */}
      <div className="mb-2 flex items-center justify-between md:hidden">
        <button
          type="button"
          onClick={goBack}
          className="grid size-[35px] place-items-center rounded-full border border-[#3c2218] bg-[#2f1d15] text-muted-foreground transition-colors hover:text-highlight"
          aria-label="Voltar"
        >
          <ChevronLeft className="size-5" strokeWidth={1.75} aria-hidden="true" />
        </button>
        <div className="flex items-center gap-2">
          <ShareButton nftId={nft.id} nftName={nft.name} editionId={editionId} variant="round" className="size-[35px] border border-[#3c2218] bg-[#2f1d15] text-highlight" />
          <FavoriteButton nftId={nft.id} nftName={nft.name} size="sm" className="size-[35px] border-[#3c2218] bg-[#2f1d15] text-highlight" />
        </div>
      </div>

      <nav aria-label="Trilha de navegação" className="mb-3 hidden text-[13px] font-semibold md:block xl:mb-3 xl:text-[15px] xl:font-bold xl:leading-4">
        <ol className="flex gap-1.5 xl:gap-[9px]">
          <li>
            <Link to="/" className="hover:text-primary">
              Início
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link to="/" hash="catalogo" className="hover:text-primary">
              Mercado
            </Link>
          </li>
          {/* O Figma do desktop mostra só Início / Mercado; o item atual continua para leitores de tela. */}
          <li aria-hidden="true" className="xl:hidden">
            /
          </li>
          <li aria-current="page" className="text-muted-foreground xl:sr-only">
            {nft.name}
          </li>
        </ol>
      </nav>

      {/* Em 1440 a galeria tem 572 px + 33 de respiro (Figma); em telas largas miniaturas, arte e respiros
          crescem na mesma proporção (as miniaturas continuam com a altura da arte). */}
      <div className="grid gap-0 md:gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[572px_minmax(0,1fr)] xl:gap-[33px] wide:grid-cols-[calc(572*var(--u))_minmax(0,1fr)] wide:gap-[calc(33*var(--u))]">
        {/* Galeria */}
        <div className="grid gap-3 md:grid-cols-[100px_1fr] xl:min-h-[448px] xl:grid-cols-[100px_minmax(0,1fr)] xl:self-start xl:items-center xl:gap-[28px] wide:min-h-[calc(448*var(--u))] wide:grid-cols-[calc(100*var(--u))_minmax(0,1fr)] wide:gap-[calc(28*var(--u))]">
          <ul className="order-2 flex gap-3 max-md:hidden md:order-1 md:flex-col xl:gap-4 wide:gap-[calc(16*var(--u))]" aria-label="Imagens do NFT">
            {nft.gallery.map((g, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => setImage(i)}
                  aria-label={`Ver imagem ${i + 1} de ${nft.gallery.length}`}
                  aria-current={i === image ? 'true' : undefined}
                  className={cn('block overflow-hidden rounded-sm border-2 border-transparent transition-colors duration-200 hover:border-primary/50 xl:rounded-lg xl:border', i === image && 'border-primary')}
                >
                  <img {...artSources(g.src, ART_SIZES.detailThumb)} alt="" width={100} height={100} loading="lazy" className="aspect-square w-16 object-cover md:w-[100px] xl:w-[98px] wide:w-[calc(98*var(--u))]" />
                </button>
              </li>
            ))}
          </ul>
          <div className="relative order-1 rounded-md md:order-2 md:bg-card md:p-5 xl:flex xl:aspect-square xl:w-full xl:items-center xl:justify-center xl:rounded-[6px] xl:p-4 wide:p-[calc(16*var(--u))]">
            <img
              {...artSources(nft.gallery[image]?.src ?? nft.image, ART_SIZES.detail)}
              alt={nft.gallery[image]?.alt ?? nft.name}
              width={430}
              height={430}
              fetchPriority="high"
              className="aspect-square w-full rounded-[20px] object-cover md:rounded-xl xl:w-[calc(100%_-_8px)] xl:rounded-[24px] wide:w-[calc(100%-8*var(--u))]"
            />
            <button
              type="button"
              onClick={() => setZoom(true)}
              className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-background/80 hover:text-primary max-md:hidden xl:right-3 xl:top-[13px] xl:size-[30px] xl:border xl:border-[#3f2319] xl:bg-[#2f1d15]"
              aria-label="Ampliar imagem"
            >
              <ZoomIn className="size-4 xl:hidden" aria-hidden="true" />
              <Search className="hidden size-6 xl:block" strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Informações e compra */}
        <div className="relative z-10 space-y-4 max-md:-ml-7 max-md:-mr-[25px] max-md:-mt-[35px] max-md:space-y-0 max-md:rounded-t-[30px] max-md:bg-card max-md:pl-6 max-md:pr-[25px] max-md:pt-[31px] xl:space-y-0">
          <div className="flex flex-wrap items-start justify-between gap-2 max-md:items-center">
            <h1 id="nft-title" className="text-[20px] font-bold leading-[28px] md:text-[28px] md:leading-normal xl:leading-[37px]">
              {nft.name}
            </h1>
            <p className="flex h-[27px] items-center gap-[5px] rounded-full border border-primary pl-[6px] pr-2 text-[13px] md:hidden">
              <Star className="size-3.5 fill-[#e3a44e] text-[#e3a44e]" aria-hidden="true" />
              <span className="font-bold">{nft.rating.toFixed(1)}</span>
              <span className="-ml-[5px] text-muted-foreground">({nft.reviewsCount})</span>
            </p>
          </div>
          <div className="hidden flex-wrap items-center justify-between gap-2 md:flex xl:mt-[9px] xl:w-[calc(100%_-_22px)] xl:flex-nowrap xl:border-b xl:border-border xl:pb-[6px] wide:w-[calc(100%-22*var(--u))]">
            <p className="text-xl font-bold text-primary xl:text-[22px] xl:leading-[28px] xl:text-highlight" data-testid="detail-price">
              {formatEth(edition.price)}
              {nft.compareAtPrice && edition.price === nft.price && (
                <s className="ml-2 text-base font-normal text-muted-foreground">
                  <span className="sr-only">Preço anterior: </span>
                  {formatEth(nft.compareAtPrice)}
                </s>
              )}
            </p>
            <p className="flex items-center gap-1 text-[13px] xl:-mr-[21px] xl:gap-1 xl:text-[15px] wide:-mr-[calc(21*var(--u))]">
              <span className="flex xl:gap-1" aria-label={`Nota ${nft.rating.toFixed(1)} de 5`} role="img">
                {Array.from({ length: 5 }, (_, i) => (
                  <Star
                    key={i}
                    className={cn('size-3.5 xl:size-[15px]', i < Math.round(nft.rating) ? 'fill-primary text-primary' : 'text-primary/40 xl:fill-muted-foreground xl:text-muted-foreground')}
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                ))}
              </span>
              {nft.reviewsCount} avaliações de colecionadores
            </p>
          </div>

          <section aria-labelledby="sobre" className="max-md:mt-3 xl:mt-[13px]">
            <h2 id="sobre" className="mb-1 text-[14px] font-bold max-md:sr-only xl:mb-3 xl:text-[15px] xl:leading-4">
              Sobre este NFT:
            </h2>
            {/* Mobile (Figma): texto curto com a edição escolhida. */}
            <p className="text-[14px] leading-[24px] text-muted-foreground md:hidden">
              Um colecionável digital {edition.name} finalizado à mão da coleção {nft.collection}, verificado na {network}.
            </p>
            <p className="text-[13px] leading-relaxed text-muted-foreground max-md:hidden xl:max-w-[574px] xl:text-[14px] xl:leading-[24px] xl:text-[#cfb28c] wide:max-w-[calc(574*var(--u))]">
              Um colecionável digital finalizado à mão da coleção {nft.collection}, verificado na {network}, com arte desbloqueável e acesso para colecionadores.
            </p>
          </section>

          <fieldset className="max-md:mt-2 xl:mt-2">
            <legend className="mb-2 text-[14px] font-bold max-md:mb-[5px] max-md:text-[15px] max-md:leading-[22px] xl:mb-3 xl:text-[15px] xl:leading-4">Edição:</legend>
            <div className="xl:flex xl:items-center xl:gap-4">
              {/* Figma (Frame 152–155, Ellipse 24–27): elipses de 28px de altura com borda de 1px (#3F2319), texto de
                  14px centralizado; larguras 36 (1/1), 42 (1/10), 46 (1/50) e 66 (ABERTA); 6px entre elas no desktop e
                  12px no mobile. A selecionada tem borda laranja e texto em negrito laranja. Telas largas: a elipse
                  cresce com o layout (o texto mantém o tamanho). */}
              <div role="radiogroup" aria-label="Edição" className="flex flex-wrap gap-3 md:gap-1.5 wide:gap-[calc(6*var(--u))]">
                {nft.editions.map((e) => {
                  const selected = e.id === edition.id
                  return (
                    <button
                      key={e.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => selectEdition(e.id)}
                      title={`${e.name} · ${formatEth(e.price)} · ${editionLabel(e)}`}
                      style={{ '--chip-w': EDITION_CHIP_WIDTH[e.name.toLowerCase()] ?? 0 } as React.CSSProperties}
                      className={cn(
                        'inline-flex h-7 min-w-[calc(var(--chip-w)*1px)] items-center justify-center rounded-[50%] border px-[3px] text-[14px] leading-4 uppercase transition-colors wide:h-[calc(28*var(--u))] wide:min-w-[calc(var(--chip-w)*var(--u))] wide:px-[calc(3*var(--u))]',
                        selected ? 'border-primary font-bold text-highlight' : 'border-[#3f2319] text-muted-foreground hover:border-primary/60 hover:text-highlight',
                        e.status !== 'on_sale' && 'line-through decoration-1 text-[#b39463]',
                      )}
                      data-testid="edition-option"
                    >
                      {e.name}
                      <span className="sr-only">
                        , {formatEth(e.price)}, {editionLabel(e)}
                      </span>
                    </button>
                  )
                })}
              </div>
              <p className="mt-2 text-[12px] text-muted-foreground max-md:sr-only xl:mt-0 xl:text-[#b09161]" aria-live="polite" data-testid="edition-availability">
                {edition.status === 'on_sale' ? `${edition.available} de ${edition.supply} disponíveis · até ${edition.maxPerOrder} por pedido` : editionLabel(edition).replace(/^./, (c) => c.toUpperCase())}
              </p>
            </div>
          </fieldset>

          <div className="hidden flex-wrap items-center justify-between gap-4 md:flex xl:mt-[13px] xl:items-start">
            <QuantityStepper value={qty} max={maxQty} onChange={setQty} label="Quantidade" disabled={!!unavailableReason} size="lg" />
            <div className="flex gap-3 xl:gap-2">
              <Button
                variant="outline"
                className="h-9 border-primary/70 bg-transparent px-3 xl:size-10 xl:rounded-[5px] xl:border-primary xl:text-highlight"
                onClick={() => buy(false)}
                disabled={!!unavailableReason || add.isPending}
                aria-label="Adicionar ao carrinho e continuar navegando"
              >
                <ShoppingCart className="size-4 xl:size-5" aria-hidden="true" />
              </Button>
              <Button className="h-9 px-8 text-[13px] font-semibold uppercase xl:h-10 xl:w-[130px] xl:rounded-[5px] xl:px-0 xl:text-[14px] xl:font-bold" onClick={() => buy(true)} disabled={!!unavailableReason || add.isPending} data-testid="buy-button">
                {add.isPending ? 'Adicionando…' : 'Comprar'}
              </Button>
              <FavoriteButton
                nftId={nft.id}
                nftName={nft.name}
                withLabel
                className="xl:h-10 xl:w-[130px] xl:justify-start xl:gap-[7px] xl:rounded-[5px] xl:border-primary xl:pl-[11px] xl:text-[14px] xl:text-highlight"
                iconClassName="xl:size-6"
              />
            </div>
          </div>
          {unavailableReason && (
            <p role="status" className="text-[13px] text-warning max-md:mt-2 xl:mt-2" data-testid="unavailable-reason">
              {unavailableReason}
            </p>
          )}

          <dl className="space-y-2 text-[13px] text-muted-foreground max-md:mt-[11px] max-md:space-y-[10px] max-md:text-[15px] max-md:leading-[22px] max-md:text-[#b09161] xl:mt-[13.5px] xl:space-y-3 xl:text-[15px] xl:leading-5 xl:text-[#b39463]">
            <div className="flex gap-1 max-md:gap-[9px] xl:gap-[9px]">
              <dt>ID do token:</dt>
              <dd>{nft.tokenId}</dd>
            </div>
            <div className="flex gap-1 max-md:gap-[9px] xl:gap-[9px]">
              <dt>Coleção:</dt>
              <dd>{nft.collection}</dd>
            </div>
            <div className="flex gap-1 max-md:gap-[9px] xl:gap-[9px]">
              <dt>Atributos:</dt>
              <dd>{nft.attributes.find((a) => a.trait === 'Atributos')?.value}</dd>
            </div>
          </dl>
          <div className="hidden items-center gap-3 text-[13px] font-bold md:flex xl:mt-[9px] xl:gap-0 xl:text-[15px] xl:leading-[22px]">
            Compartilhar este NFT:
            <a
              href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(location.href)}`}
              target="_blank"
              rel="noreferrer"
              aria-label="Compartilhar no LinkedIn (abre em nova aba)"
              className="hover:text-primary xl:ml-[8px]"
            >
              <LinkedinIcon className="size-4 xl:size-5" />
            </a>
            <a href={`mailto:?subject=${encodeURIComponent(nft.name)}&body=${encodeURIComponent(location.href)}`} aria-label="Compartilhar por e-mail" className="hover:text-primary xl:ml-[6px]">
              <Mail className="size-4 xl:h-[14px] xl:w-[18px]" strokeWidth={2} aria-hidden="true" />
            </a>
            <a href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(location.href)}`} target="_blank" rel="noreferrer" aria-label="Compartilhar no Twitter (abre em nova aba)" className="hover:text-primary xl:ml-[8px]">
              <XIcon className="size-4 xl:hidden" />
              <TwitterIcon className="hidden h-[13px] w-4 xl:block" />
            </a>
            {/* Web Share quando existe; senão copia o link (com confirmação). */}
            <ShareButton nftId={nft.id} nftName={nft.name} editionId={editionId} className="ml-2 text-[13px] xl:ml-[14px] xl:text-[14px]" />
          </div>
        </div>
      </div>

      {/* Abas: detalhes e avaliações */}
      <section className="mt-12 hidden md:block xl:mt-24">
        <div role="tablist" aria-label="Informações do NFT" className="flex gap-6 border-b border-border text-[14px] xl:gap-8 xl:text-[17px] xl:leading-4">
          {(
            [
              ['details', 'Detalhes do NFT'],
              ['reviews', `Avaliações de colecionadores (${nft.reviewsCount})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              id={`tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`panel-${id}`}
              onClick={() => setTab(id)}
              className={cn(
                '-mb-px border-b-2 border-transparent pb-2 transition-colors duration-200 hover:text-highlight xl:border-b-[3px] xl:pb-[9px] xl:pr-2',
                tab === id && 'border-primary text-primary xl:font-semibold xl:text-highlight',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="py-4 text-[13px] leading-relaxed text-muted-foreground xl:pb-0 xl:pt-[12px] xl:text-[14px] xl:leading-[24px] xl:text-[#cfb28c]">
          {tab === 'details' ? (
            <div className="space-y-3 xl:space-y-[12px]">
              <div className="space-y-3 xl:space-y-6">
                <p>{nft.description}</p>
                <p>
                  A propriedade inclui a arte em alta resolução, lançamentos exclusivos para colecionadores e um registro permanente de procedência registrada na rede. {nft.creator.name} recebe 5% de
                  direitos autorais nas vendas secundárias, apoiando novos trabalhos e lançamentos da comunidade.
                </p>
              </div>
              <p>
                <strong className="text-foreground xl:block">Rede:</strong> Cunhado na {network} com procedência imutável e metadados armazenados no IPFS.
              </p>
              <p>
                <strong className="text-foreground xl:block">Contrato:</strong> {nft.contract} • Contrato inteligente {nft.tokenStandard} verificado.
              </p>
              <p>
                <strong className="text-foreground xl:block">Direitos autorais:</strong> 5% nas vendas secundárias, pagos automaticamente pelos mercados compatíveis.
              </p>
            </div>
          ) : (
            <p>
              Nota média {nft.rating.toFixed(1)} de 5 em {nft.reviewsCount} avaliações. A leitura das avaliações individuais não faz parte desta demonstração.
            </p>
          )}
        </div>
      </section>

      <MoreFromCollection nft={nft} />

      {/* Mobile: barra fixa de compra (Figma) */}
      <div
        ref={buyBarRef}
        className="fixed inset-x-0 bottom-0 z-50 h-[159px] rounded-t-[30px] bg-card pl-6 pr-[25px] pt-[21px] shadow-[0_-3px_6px_rgba(0,0,0,0.18)] md:hidden"
        data-testid="mobile-buy-bar"
        data-motion-fixed
      >
        <div className="flex h-7 items-center justify-between">
          <div className="flex items-center gap-[13px] text-[14px] text-muted-foreground">
            Qtd.
            <QuantityStepper value={qty} max={maxQty} onChange={setQty} label="Quantidade" disabled={!!unavailableReason} size="pill" />
          </div>
          <p className="text-[20px] font-bold leading-7 text-highlight">{formatEth(edition.price)}</p>
        </div>
        <div className="mt-[21px] flex gap-3">
          <Button
            className="h-[60px] w-[196px] rounded-full bg-[linear-gradient(90deg,#d08a4c,#b77842)] text-[16px] font-bold text-primary-foreground hover:brightness-110"
            onClick={() => buy(true)}
            disabled={!!unavailableReason || add.isPending}
          >
            Comprar NFT
          </Button>
          <Button
            variant="outline"
            className="size-[60px] rounded-full border-[#3f2319] bg-[#2a1a14] text-[#b39463] hover:text-highlight dark:bg-[#2a1a14]"
            onClick={() => buy(false)}
            disabled={!!unavailableReason || add.isPending}
            aria-label="Adicionar ao carrinho"
          >
            <CartFilledIcon />
          </Button>
        </div>
      </div>

      <Dialog open={zoom} onOpenChange={setZoom}>
        <DialogContent className="max-w-[min(90vw,720px)] border-border bg-card p-3">
          <DialogTitle className="sr-only">{nft.name} ampliado</DialogTitle>
          <DialogDescription className="sr-only">{nft.gallery[image]?.alt}</DialogDescription>
          <img {...artSources(nft.gallery[image]?.src ?? nft.image, ART_SIZES.zoom)} alt={nft.gallery[image]?.alt ?? nft.name} width={720} height={720} className="h-auto w-full rounded-lg" />
        </DialogContent>
      </Dialog>
    </article>
  )
}

/** Carrinho cheio do Figma mobile (botão redondo da barra de compra). */
function CartFilledIcon() {
  return (
    <svg viewBox="0 0 20 18" width="20" height="18" fill="currentColor" aria-hidden="true">
      <path d="M0 1a1 1 0 0 1 1-1h2.2a1 1 0 0 1 1 .8L4.5 2.6H19a1 1 0 0 1 .96 1.28l-2 6.8a1 1 0 0 1-.96.72H6.6l.3 1.4H17a1 1 0 1 1 0 2H6.1a1 1 0 0 1-1-.8L2.4 2H1a1 1 0 0 1-1-1z" />
      <circle cx="7" cy="16.4" r="1.6" />
      <circle cx="15.4" cy="16.4" r="1.6" />
    </svg>
  )
}

const PER_PAGE = 5

function MoreFromCollection({ nft }: { nft: NftDetail }) {
  const { data, isPending } = useQuery(nftListQuery({ q: nft.collection, pageSize: PER_PAGE * 3 + 1, page: 1 }))
  const [page, setPage] = useState(0)
  const items = data?.items.filter((i) => i.id !== nft.id).slice(0, PER_PAGE * 3) ?? []
  if (isPending) return <CollectionSkeleton />
  if (!items.length) return null
  const pages = Math.ceil(items.length / PER_PAGE)
  const current = Math.min(page, pages - 1)
  return (
    <section aria-labelledby="mais-colecao" className="mt-10 max-md:-ml-7 max-md:-mr-[25px] max-md:px-6 xl:mt-24">
      <h2 id="mais-colecao" className="mb-4 border-b border-border pb-2 text-[14px] font-semibold text-primary xl:mb-8 xl:pb-[11px] xl:text-[17px] xl:font-bold xl:leading-4 xl:text-highlight">
        Mais desta coleção
      </h2>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:gap-[26px] wide:gap-[calc(26*var(--u))]" aria-live="polite" data-reveal-group>
        {items.slice(current * PER_PAGE, current * PER_PAGE + PER_PAGE).map((n) => (
          <li key={n.id}>
            <NftCard nft={n} variant="detail" />
          </li>
        ))}
      </ul>
      {pages > 1 && (
        // Botões de 24x24 (área de toque da WCAG 2.5.8) com o ponto de 12px no meio; as margens negativas
        // mantêm o ponto e o conteúdo abaixo exatamente onde estavam.
        <div className="-mb-1.5 mt-[22px] flex justify-center xl:mt-[26px]" role="group" aria-label="Páginas da coleção">
          {Array.from({ length: pages }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setPage(i)}
              aria-label={`Página ${i + 1} de ${pages}`}
              aria-current={i === current ? 'true' : undefined}
              className="group/dot grid size-6 place-items-center"
            >
              <span
                className={cn('size-3 rounded-full border border-primary transition-colors group-hover/dot:bg-primary/60 xl:border-[1.3px]', i === current && 'bg-primary')}
              />
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

/** "Mais desta coleção" enquanto a lista da coleção carrega (mesmo título, grade e pontos). */
function CollectionSkeleton() {
  return (
    <section aria-labelledby="mais-colecao" aria-busy="true" className="mt-10 max-md:-ml-7 max-md:-mr-[25px] max-md:px-6 xl:mt-24" data-testid="collection-loading">
      <h2 id="mais-colecao" className="mb-4 border-b border-border pb-2 text-[14px] font-semibold text-primary xl:mb-8 xl:pb-[11px] xl:text-[17px] xl:font-bold xl:leading-4 xl:text-highlight">
        Mais desta coleção
      </h2>
      <p className="sr-only">Carregando NFTs da coleção…</p>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:gap-[26px] wide:gap-[calc(26*var(--u))]" aria-hidden="true">
        {Array.from({ length: PER_PAGE }, (_, i) => (
          <li key={i}>
            <VitrineCardSkeleton variant="detail" />
          </li>
        ))}
      </ul>
      <VitrineDotsSkeleton className="mt-[28px] xl:mt-8" />
    </section>
  )
}

/**
 * Detalhe em carregamento: mesma estrutura e as mesmas classes de layout do DetailView (galeria,
 * cartão de informações, abas, vitrine e, no celular, a barra fixa de compra), com cada texto
 * trocado por uma barra da altura da sua linha. Sem pulo de layout quando os dados chegam.
 */
function DetailSkeleton() {
  const buyBarRef = useBottomBar()
  return (
    <div
      className="container-page pb-28 pt-4 max-md:bg-[linear-gradient(180deg,#251712,#2c1b15_395px,#241612_395px)] max-md:pb-[180px] max-md:pl-7 max-md:pr-[25px] max-md:pt-[23px] md:pb-0 md:pt-6 xl:pb-4 xl:pt-8"
      aria-busy="true"
      aria-label="Carregando NFT"
      data-testid="detail-loading"
    >
      <p className="sr-only">Carregando NFT…</p>
      <div aria-hidden="true">
        {/* Mobile: voltar e favoritar */}
        <div className="mb-2 flex items-center justify-between md:hidden">
          <Skeleton className="size-[35px] rounded-full" />
          <Skeleton className="size-[35px] rounded-full" />
        </div>
        {/* Trilha (13px no md, 15/16 no xl) */}
        <SkeletonLine className="mb-3 hidden h-[19.5px] w-[150px] md:flex xl:h-4" />

        <div className="grid gap-0 md:gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[572px_minmax(0,1fr)] xl:gap-[33px] wide:grid-cols-[calc(572*var(--u))_minmax(0,1fr)] wide:gap-[calc(33*var(--u))]">
          <div className="grid gap-3 md:grid-cols-[100px_1fr] xl:min-h-[448px] xl:grid-cols-[100px_minmax(0,1fr)] xl:self-start xl:items-center xl:gap-[28px] wide:min-h-[calc(448*var(--u))] wide:grid-cols-[calc(100*var(--u))_minmax(0,1fr)] wide:gap-[calc(28*var(--u))]">
            <div className="order-2 flex gap-3 max-md:hidden md:order-1 md:flex-col xl:gap-4 wide:gap-[calc(16*var(--u))]">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="size-[104px] rounded-sm xl:size-[100px] xl:rounded-lg wide:size-[calc(98*var(--u)+2px)]" />
              ))}
            </div>
            <div className="relative order-1 rounded-md md:order-2 md:bg-card md:p-5 xl:flex xl:aspect-square xl:w-full xl:items-center xl:justify-center xl:rounded-[6px] xl:p-4 wide:p-[calc(16*var(--u))]">
              <Skeleton className="aspect-square w-full rounded-[20px] md:rounded-xl xl:w-[calc(100%_-_8px)] xl:rounded-[24px] wide:w-[calc(100%-8*var(--u))]" />
            </div>
          </div>

          <div className="relative z-10 space-y-4 max-md:-ml-7 max-md:-mr-[25px] max-md:-mt-[35px] max-md:space-y-0 max-md:rounded-t-[30px] max-md:bg-card max-md:pl-6 max-md:pr-[25px] max-md:pt-[31px] xl:space-y-0">
            <div className="flex items-center justify-between gap-2 md:items-start">
              <SkeletonLine className="h-7 w-[58%] md:h-[37px] md:w-[270px]" />
              <Skeleton className="h-[27px] w-[78px] rounded-full md:hidden" />
            </div>
            <div className="hidden items-center justify-between gap-2 md:flex xl:mt-[9px] xl:w-[calc(100%_-_22px)] xl:border-b xl:border-border xl:pb-[6px] wide:w-[calc(100%-22*var(--u))]">
              <SkeletonLine className="h-7 w-[104px]" />
              <SkeletonLine className="h-[19.5px] w-[300px] xl:-mr-[21px] xl:h-[22.5px] xl:w-[372px]" />
            </div>

            <div className="max-md:mt-3 xl:mt-[13px]">
              <SkeletonLine className="mb-1 hidden h-[21px] w-[130px] md:flex xl:mb-3 xl:h-4" />
              {/* Texto "sobre": 3 linhas de 24px no celular e no xl (13px, lh 1.625 no md). */}
              <SkeletonLine className="h-6 md:h-[21px] xl:h-6" />
              <SkeletonLine className="h-6 md:h-[21px] xl:h-6" />
              <SkeletonLine className="h-6 w-[45%] md:h-[21px] xl:h-6" />
            </div>

            <div className="max-md:mt-2 xl:mt-2">
              <SkeletonLine className="mb-2 h-[21px] w-[64px] max-md:mb-[5px] max-md:h-[22px] xl:mb-3 xl:h-4" />
              <div className="xl:flex xl:items-center xl:gap-4">
                <div className="flex gap-2 max-md:gap-3 xl:gap-1.5">
                  {[40, 48, 52, 64].map((w) => (
                    <Skeleton key={w} className="h-7 rounded-full" style={{ width: w }} />
                  ))}
                </div>
                <SkeletonLine className="mt-2 h-[18px] w-[280px] max-md:hidden xl:mt-0" />
              </div>
            </div>

            <div className="hidden items-start justify-between gap-4 md:flex xl:mt-[13px]">
              <Skeleton className="h-[49.5px] w-[103px] rounded-full" />
              <div className="flex gap-3 xl:gap-2">
                <Skeleton className="h-9 w-10 xl:h-10 xl:rounded-[5px]" />
                <Skeleton className="h-9 w-[110px] xl:h-10 xl:w-[130px] xl:rounded-[5px]" />
                <Skeleton className="h-9 w-[110px] xl:h-10 xl:w-[130px] xl:rounded-[5px]" />
              </div>
            </div>

            <div className="space-y-2 max-md:mt-[11px] max-md:space-y-[10px] xl:mt-[13.5px] xl:space-y-3">
              {['w-[170px]', 'w-[200px]', 'w-[300px]'].map((w) => (
                <SkeletonLine key={w} className={cn('h-[19.5px] max-md:h-[22px] xl:h-5', w)} />
              ))}
            </div>
            <SkeletonLine className="hidden h-[19.5px] w-[230px] md:flex xl:mt-[9px] xl:h-[22px] xl:w-[270px]" />
          </div>
        </div>

        {/* Abas e texto dos detalhes (só a partir do md) */}
        <div className="mt-12 hidden md:block xl:mt-24">
          <div className="flex gap-6 border-b border-border pb-[9px] xl:gap-8 xl:pb-[11px]">
            <SkeletonLine className="h-[21px] w-[130px] xl:h-4 xl:w-[150px]" />
            <SkeletonLine className="h-[21px] w-[260px] xl:h-4 xl:w-[330px]" />
          </div>
          <div className="space-y-3 py-4 xl:space-y-[12px] xl:pb-0 xl:pt-[12px]">
            <div className="space-y-3 xl:space-y-6">
              <div>
                <SkeletonLine className="h-[21px] xl:h-6" />
                <SkeletonLine className="h-[21px] w-1/2 xl:h-6" />
              </div>
              <div>
                <SkeletonLine className="h-[21px] xl:h-6" />
                <SkeletonLine className="h-[21px] w-2/5 xl:h-6" />
              </div>
            </div>
            {['w-[55%]', 'w-[45%]', 'w-[55%]'].map((w, i) => (
              <div key={i}>
                <SkeletonLine className="h-[21px] w-[150px] xl:h-6" />
                <SkeletonLine className={cn('h-[21px] xl:h-6', w)} />
              </div>
            ))}
          </div>
        </div>

        <CollectionSkeleton />

        {/* Mobile: barra fixa de compra */}
        <div ref={buyBarRef} className="fixed inset-x-0 bottom-0 z-50 h-[159px] rounded-t-[30px] bg-card pl-6 pr-[25px] pt-[21px] shadow-[0_-3px_6px_rgba(0,0,0,0.18)] md:hidden" data-motion-fixed>
          <div className="flex h-7 items-center justify-between">
            <Skeleton className="h-7 w-[110px] rounded-full" />
            <SkeletonLine className="h-7 w-[96px]" />
          </div>
          <div className="mt-[21px] flex gap-3">
            <Skeleton className="h-[60px] w-[196px] rounded-full" />
            <Skeleton className="size-[60px] rounded-full" />
          </div>
        </div>
      </div>
    </div>
  )
}
