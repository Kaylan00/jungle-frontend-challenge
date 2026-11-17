import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { ChevronLeft, Mail, Search, ShoppingCart, Star, ZoomIn } from 'lucide-react'
import { LinkedinIcon, TwitterIcon, XIcon } from '@/components/shared/brand-icons'
import { useEffect, useState } from 'react'
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
import { formatEth } from '@/lib/eth'
import { cn } from '@/lib/utils'

export function NftDetailPage({ nftId, editionId }: { nftId: string; editionId?: string }) {
  const query = useQuery(nftDetailQuery(nftId))

  if (query.isError) {
    if (query.error instanceof ApiError && query.error.code === 'NOT_FOUND') {
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

function editionLabel(e: Edition) {
  if (e.status === 'unavailable') return 'indisponível'
  if (e.status === 'sold_out') return 'esgotada'
  return `${e.available} disponíveis`
}

function DetailView({ nft, editionId }: { nft: NftDetail; editionId?: string }) {
  const navigate = useNavigate()
  const router = useRouter()
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

  // Se o limite cair (evento de estoque, item no carrinho), a quantidade acompanha.
  useEffect(() => {
    setQty((q) => Math.max(1, Math.min(q, limit || 1)))
  }, [limit])

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
    <article className="container-page pb-28 pt-4 md:pb-0 md:pt-6 xl:pt-[30px]" aria-labelledby="nft-title">
      {/* Mobile: topo com voltar e favoritar */}
      <div className="mb-3 flex items-center justify-between md:hidden">
        <button type="button" onClick={() => router.history.back()} className="grid size-9 place-items-center rounded-full bg-card" aria-label="Voltar">
          <ChevronLeft className="size-5 text-primary" aria-hidden="true" />
        </button>
        <FavoriteButton nftId={nft.id} nftName={nft.name} size="sm" />
      </div>

      <nav aria-label="Trilha de navegação" className="mb-3 hidden text-[13px] font-semibold md:block xl:mb-[10px] xl:text-[15px] xl:font-bold xl:leading-[22px]">
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

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[572px_minmax(0,1fr)] xl:gap-[33px]">
        {/* Galeria */}
        <div className="grid gap-3 md:grid-cols-[100px_1fr] xl:grid-cols-[100px_444px] xl:gap-[28px]">
          <ul className="order-2 flex gap-3 md:order-1 md:flex-col xl:-mt-0.5 xl:gap-4" aria-label="Imagens do NFT">
            {nft.gallery.map((g, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => setImage(i)}
                  aria-label={`Ver imagem ${i + 1} de ${nft.gallery.length}`}
                  aria-current={i === image ? 'true' : undefined}
                  className={cn('block overflow-hidden rounded-sm border-2 border-transparent xl:rounded-lg xl:border', i === image && 'border-primary')}
                >
                  <img src={g.src} alt="" width={100} height={100} loading="lazy" className="aspect-square w-16 object-cover md:w-[100px] xl:w-[98px]" />
                </button>
              </li>
            ))}
          </ul>
          <div className="relative order-1 rounded-md bg-card p-3 md:order-2 md:p-5 xl:size-[444px] xl:rounded-[5px]">
            <img
              src={nft.gallery[image]?.src ?? nft.image}
              alt={nft.gallery[image]?.alt ?? nft.name}
              width={430}
              height={430}
              fetchPriority="high"
              className="aspect-square w-full rounded-xl object-cover xl:rounded-[24px]"
            />
            <button
              type="button"
              onClick={() => setZoom(true)}
              className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-background/80 hover:text-primary xl:right-3 xl:top-[13px] xl:size-[30px] xl:bg-[#2f1d15]"
              aria-label="Ampliar imagem"
            >
              <ZoomIn className="size-4 xl:hidden" aria-hidden="true" />
              <Search className="hidden size-6 xl:block" strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Informações e compra */}
        <div className="space-y-4 xl:space-y-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h1 id="nft-title" className="text-2xl font-bold md:text-[28px] xl:leading-[33px]">
              {nft.name}
            </h1>
            <p className="flex items-center gap-1 rounded-full border border-primary px-2 py-0.5 text-[12px] md:hidden">
              <Star className="size-3 fill-primary text-primary" aria-hidden="true" /> {nft.rating.toFixed(1)}
              <span className="text-muted-foreground">({nft.reviewsCount})</span>
            </p>
          </div>
          <div className="hidden flex-wrap items-center justify-between gap-2 md:flex xl:mt-[11px] xl:w-[573px] xl:flex-nowrap xl:border-b xl:border-border xl:pb-[6px]">
            <p className="text-xl font-bold text-primary xl:text-[22px] xl:leading-[28px] xl:text-highlight" data-testid="detail-price">
              {formatEth(edition.price)}
              {nft.compareAtPrice && edition.price === nft.price && (
                <s className="ml-2 text-base font-normal text-muted-foreground">
                  <span className="sr-only">Preço anterior: </span>
                  {formatEth(nft.compareAtPrice)}
                </s>
              )}
            </p>
            <p className="flex items-center gap-1 text-[13px] xl:-mr-[22px] xl:gap-1.5 xl:text-[15px]">
              <span className="flex xl:gap-[3px]" aria-label={`Nota ${nft.rating.toFixed(1)} de 5`} role="img">
                {Array.from({ length: 5 }, (_, i) => (
                  <Star
                    key={i}
                    className={cn('size-3.5 xl:size-4', i < Math.round(nft.rating) ? 'fill-primary text-primary' : 'text-primary/40 xl:fill-muted-foreground xl:text-muted-foreground')}
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                ))}
              </span>
              {nft.reviewsCount} avaliações de colecionadores
            </p>
          </div>

          <section aria-labelledby="sobre" className="xl:mt-[11px]">
            <h2 id="sobre" className="mb-1 text-[14px] font-bold xl:mb-[8px] xl:text-[15px] xl:leading-[22px]">
              Sobre este NFT:
            </h2>
            <p className="text-[13px] leading-relaxed text-muted-foreground xl:text-[14px] xl:leading-[24px] xl:text-[#cbaf89]">
              Um colecionável digital finalizado à mão da coleção {nft.collection}, verificado na {network}, com arte desbloqueável e acesso para colecionadores.
            </p>
          </section>

          <fieldset className="xl:mt-[5px]">
            <legend className="mb-2 text-[14px] font-bold xl:mb-[8px] xl:text-[15px] xl:leading-[22px]">Edição:</legend>
            <div className="xl:flex xl:items-center xl:gap-4">
              <div role="radiogroup" aria-label="Edição" className="flex flex-wrap gap-2 xl:gap-1.5">
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
                      className={cn(
                        'rounded-full border px-3 py-1 text-[12px] uppercase transition-colors xl:h-[29px] xl:px-[5px] xl:py-0 xl:text-[14px]',
                        selected ? 'border-primary bg-primary/15 text-primary xl:bg-transparent xl:font-bold xl:text-highlight' : 'border-border hover:border-primary/60 xl:border-[#3f2319] xl:text-muted-foreground',
                        e.status !== 'on_sale' && 'line-through decoration-1 text-[#b39463] xl:text-[#b39463]',
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
              <p className="mt-2 text-[12px] text-muted-foreground xl:mt-0 xl:text-[#b09161]" aria-live="polite" data-testid="edition-availability">
                {edition.status === 'on_sale' ? `${edition.available} de ${edition.supply} disponíveis · até ${edition.maxPerOrder} por pedido` : editionLabel(edition).replace(/^./, (c) => c.toUpperCase())}
              </p>
            </div>
          </fieldset>

          <div className="hidden flex-wrap items-center justify-between gap-4 md:flex xl:mt-[13px] xl:items-start">
            <QuantityStepper value={qty} max={Math.max(1, limit)} onChange={setQty} label="Quantidade" disabled={!!unavailableReason} size="lg" className="xl:mt-px" />
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
            <p role="status" className="text-[13px] text-warning xl:mt-2" data-testid="unavailable-reason">
              {unavailableReason}
            </p>
          )}

          <dl className="space-y-2 text-[13px] text-muted-foreground xl:mt-[13px] xl:space-y-[10px] xl:text-[15px] xl:leading-[22px] xl:text-[#b09161]">
            <div className="flex gap-1 xl:gap-[9px]">
              <dt>ID do token:</dt>
              <dd>{nft.tokenId}</dd>
            </div>
            <div className="flex gap-1 xl:gap-[9px]">
              <dt>Coleção:</dt>
              <dd>{nft.collection}</dd>
            </div>
            <div className="flex gap-1 xl:gap-[9px]">
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
          </div>
        </div>
      </div>

      {/* Abas: detalhes e avaliações */}
      <section className="mt-12 hidden md:block xl:mt-[91px]">
        <div role="tablist" aria-label="Informações do NFT" className="flex gap-6 border-b border-border text-[14px] xl:gap-8 xl:text-[17px] xl:leading-[24px]">
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
                '-mb-px border-b-2 border-transparent pb-2 xl:border-b-[3px] xl:pb-[4px] xl:pr-2',
                tab === id && 'border-primary text-primary xl:font-semibold xl:text-highlight',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="py-4 text-[13px] leading-relaxed text-muted-foreground xl:pb-0 xl:pt-[12px] xl:text-[14px] xl:leading-[24px] xl:text-[#cbaf89]">
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
                <strong className="text-foreground xl:block">Contrato:</strong> {nft.contract} · {nft.tokenStandard} verificado.
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
      <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-border bg-card px-4 pb-4 pt-3 md:hidden" data-testid="mobile-buy-bar">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[13px]">
            Qtd.
            <QuantityStepper value={qty} max={Math.max(1, limit)} onChange={setQty} label="Quantidade" disabled={!!unavailableReason} />
          </div>
          <p className="text-lg font-bold text-primary">{formatEth(edition.price)}</p>
        </div>
        <div className="mt-3 flex gap-3">
          <Button className="h-12 flex-1 rounded-full text-[14px] font-semibold" onClick={() => buy(true)} disabled={!!unavailableReason || add.isPending}>
            Comprar NFT
          </Button>
          <Button variant="outline" className="size-12 rounded-full bg-transparent" onClick={() => buy(false)} disabled={!!unavailableReason || add.isPending} aria-label="Adicionar ao carrinho">
            <ShoppingCart className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <Dialog open={zoom} onOpenChange={setZoom}>
        <DialogContent className="max-w-[min(90vw,720px)] border-border bg-card p-3">
          <DialogTitle className="sr-only">{nft.name} ampliado</DialogTitle>
          <DialogDescription className="sr-only">{nft.gallery[image]?.alt}</DialogDescription>
          <img src={nft.gallery[image]?.src ?? nft.image} alt={nft.gallery[image]?.alt ?? nft.name} className="w-full rounded-lg" />
        </DialogContent>
      </Dialog>
    </article>
  )
}

const PER_PAGE = 5

function MoreFromCollection({ nft }: { nft: NftDetail }) {
  const { data } = useQuery(nftListQuery({ q: nft.collection, pageSize: PER_PAGE * 3 + 1, page: 1 }))
  const [page, setPage] = useState(0)
  const items = data?.items.filter((i) => i.id !== nft.id).slice(0, PER_PAGE * 3) ?? []
  if (!items.length) return null
  const pages = Math.ceil(items.length / PER_PAGE)
  const current = Math.min(page, pages - 1)
  return (
    <section aria-labelledby="mais-colecao" className="mt-10 xl:mt-[93px]">
      <h2 id="mais-colecao" className="mb-4 border-b border-border pb-2 text-[14px] font-semibold text-primary xl:mb-8 xl:pb-[6px] xl:text-[17px] xl:leading-6 xl:text-highlight">
        Mais desta coleção
      </h2>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:gap-[26px]" aria-live="polite">
        {items.slice(current * PER_PAGE, current * PER_PAGE + PER_PAGE).map((n) => (
          <li key={n.id}>
            <NftCard nft={n} />
          </li>
        ))}
      </ul>
      {pages > 1 && (
        <div className="mt-[28px] flex justify-center gap-2" role="group" aria-label="Páginas da coleção">
          {Array.from({ length: pages }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setPage(i)}
              aria-label={`Página ${i + 1} de ${pages}`}
              aria-current={i === current ? 'true' : undefined}
              className={cn('size-3 rounded-full border border-primary transition-colors hover:bg-primary/60', i === current && 'bg-primary')}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function DetailSkeleton() {
  return (
    <div className="container-page pt-6" aria-busy="true" aria-label="Carregando NFT" data-testid="detail-loading">
      <Skeleton className="mb-3 hidden h-4 w-40 md:block" />
      <div className="grid gap-8 lg:grid-cols-2 lg:gap-10">
        <div className="grid gap-3 md:grid-cols-[100px_1fr]">
          <div className="order-2 flex gap-3 md:order-1 md:flex-col">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="aspect-square w-16 md:w-[100px]" />
            ))}
          </div>
          <div className="order-1 rounded-md bg-card p-3 md:order-2 md:p-5">
            <Skeleton className="aspect-square w-full rounded-xl" />
          </div>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-6 w-1/4" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-20 w-1/2" />
        </div>
      </div>
    </div>
  )
}
