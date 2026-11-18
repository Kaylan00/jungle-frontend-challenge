/**
 * Seção "NFTs" do Kurio Admin: busca, paginação e, por NFT, destaque e edição de cada edição
 * (preço, disponibilidade e status). Cada gravação manda a versão do NFT que está na tela; se ele mudou
 * desde então, a API responde 409 e o diálogo mostra os valores atuais para decidir.
 * Carregando (primeira leitura, busca ou página): fichas skeleton com a mesma marcação das fichas reais, na
 * quantidade que estava na tela (ou uma página cheia), e a contagem em skeleton. As edições não carregam ao
 * expandir: vêm junto com o NFT na lista, então abrem na hora.
 */
import { zodResolver } from '@hookform/resolvers/zod'
import type { UseQueryResult } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ChevronDown, ChevronLeft, ChevronRight, Search, Star } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { AdminEditionForm, type AdminNftListResponse, type Edition, type NftDetail } from '@/api/contracts'
import { ApiError } from '@/api/http'
import { EmptyState, ErrorState } from '@/components/shared/error-state'
import { FormField } from '@/components/shared/form-field'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NETWORK_LABEL } from '@/features/catalog/search-params'
import { primaryButton } from '@/features/profile/profile-page'
import { ART_SIZES, artSources } from '@/lib/art'
import { formatEth } from '@/lib/eth'
import { applyApiFieldErrors } from '@/lib/form-errors'
import { ADMIN_PAGE_SIZE } from '@/api/queries'
import { cn } from '@/lib/utils'
import { useToggleFeatured, useUpdateEdition, versionConflictOf } from './hooks'
import { LoadingNote, Sk, SkBlock } from './sections/ui'

export interface NftsSearch {
  q?: string
  pagina?: number
  /** NFT com as edições abertas ao chegar (a busca global leva direto a ele) */
  abrir?: string
}

const STATUS_LABEL: Record<Edition['status'], string> = { on_sale: 'À venda', sold_out: 'Esgotada', unavailable: 'Indisponível' }
const STATUS_CLASS: Record<Edition['status'], string> = {
  on_sale: 'border-success/40 bg-success/10 text-success',
  sold_out: 'border-warning/40 bg-warning/10 text-warning',
  unavailable: 'border-border bg-secondary text-muted-foreground',
}

/** Valor exato (o painel não arredonda: até 18 casas). */
const exactEth = (v: string) => formatEth(v, { maxDecimals: 18 })

export function AdminNfts({ query, search }: { query: UseQueryResult<AdminNftListResponse>; search: NftsSearch }) {
  const navigate = useNavigate()
  const [term, setTerm] = useState(search.q ?? '')
  const [editing, setEditing] = useState<{ nft: NftDetail; editionId: string } | null>(null)

  // Busca com debounce: a URL guarda o termo (refresh e voltar mantêm) e a página volta para 1.
  useEffect(() => setTerm(search.q ?? ''), [search.q])
  useEffect(() => {
    if ((search.q ?? '') === term.trim()) return
    const t = setTimeout(() => void navigate({ to: '/admin/nfts', search: { q: term.trim() || undefined }, replace: true, resetScroll: false }), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term])

  const goToPage = (pagina: number) =>
    void navigate({ to: '/admin/nfts', search: (prev) => ({ q: prev.q, pagina: pagina > 1 ? pagina : undefined }), resetScroll: false })

  const data = query.data
  // O diálogo acompanha o NFT ao vivo (eventos de outras abas atualizam a lista) enquanto ele estiver na página.
  const liveNft = editing ? (data?.items.find((n) => n.id === editing.nft.id) ?? editing.nft) : null

  return (
    <div className="flex flex-col gap-5">
      <NftsToolbar term={term} onTerm={setTerm} total={query.isPlaceholderData ? undefined : data?.total} q={search.q} />

      {query.isPending || query.isPlaceholderData ? (
        <>
          <NftListSkeleton rows={data?.items.length || ADMIN_PAGE_SIZE} />
          {data && data.totalPages > 1 && <NftsPager page={data.page} totalPages={data.totalPages} onPage={goToPage} />}
        </>
      ) : query.isError ? (
        <ErrorState
          title="Não foi possível carregar os NFTs"
          message={query.error instanceof ApiError ? query.error.message : undefined}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          title="Nenhum NFT encontrado"
          message="Confira o nome ou busque pela coleção ou pelo id (ex.: nft-01)."
          action={
            <Button variant="outline" onClick={() => setTerm('')}>
              Limpar busca
            </Button>
          }
        />
      ) : (
        <>
          <ul className="flex flex-col gap-3" data-testid="admin-nft-list">
            {query.data.items.map((nft) => (
              <NftRow key={search.abrir === nft.id ? `${nft.id}:aberto` : nft.id} nft={nft} defaultOpen={search.abrir === nft.id} onEdit={(editionId) => setEditing({ nft, editionId })} />
            ))}
          </ul>
          {query.data.totalPages > 1 && <NftsPager page={query.data.page} totalPages={query.data.totalPages} onPage={goToPage} />}
        </>
      )}

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        {editing && liveNft && <EditionDialog key={`${editing.nft.id}:${editing.editionId}`} nft={liveNft} editionId={editing.editionId} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  )
}

/** Busca e contagem da lista. Sem contagem ainda, ela aparece em skeleton no mesmo lugar. */
export function NftsToolbar({ term, onTerm, total, q, disabled }: { term: string; onTerm: (v: string) => void; total?: number; q?: string; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="relative w-full sm:w-[340px]">
        <label htmlFor="admin-search" className="mb-2 block text-[14px] leading-4">
          Buscar NFT
        </label>
        <Search className="pointer-events-none absolute bottom-3 left-3 size-4 text-[var(--kp-fumaca)]" aria-hidden="true" />
        <input
          id="admin-search"
          type="search"
          value={term}
          onChange={(e) => onTerm(e.target.value)}
          disabled={disabled}
          placeholder="Nome, coleção ou id (nft-01)"
          className="h-10 w-full rounded-[10px] border border-[var(--kp-linha-forte)] bg-[var(--kp-ficha)] pl-9 pr-3 text-[14px] placeholder:text-[var(--kp-fumaca)] focus-visible:border-[var(--kp-laranja)] focus-visible:outline-none"
        />
      </div>
      {total === undefined ? (
        <p className="text-[13px]">
          <Sk>00 NFTs</Sk>
        </p>
      ) : (
        <p className="text-[13px] text-muted-foreground" aria-live="polite">
          {total} {total === 1 ? 'NFT' : 'NFTs'}
          {q ? ` para “${q}”` : ''}
        </p>
      )}
    </div>
  )
}

function NftsPager({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (page: number) => void }) {
  return (
    <nav aria-label="Páginas da lista de NFTs" className="flex items-center justify-between gap-3">
      <Button variant="outline" onClick={() => onPage(page - 1)} disabled={page <= 1}>
        <ChevronLeft aria-hidden="true" />
        Anterior
      </Button>
      <p className="text-[13px] text-muted-foreground" aria-current="page">
        Página {page} de {totalPages}
      </p>
      <Button variant="outline" onClick={() => onPage(page + 1)} disabled={page >= totalPages}>
        Próxima
        <ChevronRight aria-hidden="true" />
      </Button>
    </nav>
  )
}

const SAMPLE_NFTS = [
  ['Emerald Ape #042', 'Selva Digital · Ethereum · nft-01'],
  ['Cosmic Owl #07', 'Noite Kurio · Polygon · nft-02'],
  ['Jade Tiger #13', 'Selva Digital · Ethereum · nft-03'],
  ['Ruby Fox #21', 'Raposas · Polygon · nft-04'],
] as const

/** Fichas de NFT carregando: mesma marcação da NftRow (imagem, nome, coleção, preço, estoque e os dois botões). */
export function NftListSkeleton({ rows }: { rows: number }) {
  return (
    <div aria-busy="true">
      <LoadingNote>Carregando NFTs…</LoadingNote>
      <ul className="flex flex-col gap-3" aria-hidden="true" data-testid="nfts-skeleton">
        {Array.from({ length: rows }, (_, i) => {
          const [name, sub] = SAMPLE_NFTS[i % SAMPLE_NFTS.length]
          return (
            <li key={i} className="kp-ficha">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
                <SkBlock className="size-14 shrink-0 rounded-md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-bold leading-5">
                    <Sk>{name}</Sk>
                  </p>
                  <p className="truncate text-[13px] leading-5">
                    <Sk>{sub}</Sk>
                  </p>
                </div>
                <div className="flex w-full flex-wrap items-center justify-between gap-3 sm:w-auto sm:justify-end sm:gap-5">
                  <dl className="flex gap-5 text-[13px] leading-5">
                    <div>
                      <dt className="text-muted-foreground">A partir de</dt>
                      <dd className="font-bold">
                        <Sk>0.483 ETH</Sk>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">À venda</dt>
                      <dd>
                        <Sk>00</Sk>
                      </dd>
                    </div>
                  </dl>
                  <div className="flex items-center gap-2">
                    <span className="kp-sk-bloco inline-flex h-9 items-center gap-1.5 rounded-md border border-transparent px-3 text-[13px] font-medium text-transparent select-none">
                      <span className="size-4" />
                      Destacar
                    </span>
                    <span className="kp-sk-bloco inline-flex h-9 items-center gap-1.5 rounded-md border border-transparent px-2.5 text-sm font-medium text-transparent select-none">
                      Edições (4)
                      <span className="size-4" />
                    </span>
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function NftRow({ nft, defaultOpen = false, onEdit }: { nft: NftDetail; defaultOpen?: boolean; onEdit: (editionId: string) => void }) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()
  const rowRef = useRef<HTMLLIElement>(null)
  // Chegou pela busca global: a linha já nasce aberta (a chave muda) e vem para a vista.
  useEffect(() => {
    if (defaultOpen) rowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [defaultOpen])
  return (
    <li ref={rowRef} className={cn('kp-ficha transition-colors', defaultOpen && 'border-[rgb(210_138_76/0.55)]')} data-testid="admin-nft" data-nft-id={nft.id}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
        <img {...artSources(nft.image, ART_SIZES.detailThumb)} alt="" width={56} height={56} loading="lazy" className="size-14 shrink-0 rounded-md object-cover" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-bold leading-5">{nft.name}</h2>
          <p className="truncate text-[13px] leading-5 text-muted-foreground">
            {nft.collection} · {NETWORK_LABEL[nft.network]} · <span className="text-subtle-foreground">{nft.id}</span>
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center justify-between gap-3 sm:w-auto sm:justify-end sm:gap-5">
          <dl className="flex gap-5 text-[13px] leading-5">
            <div>
              <dt className="text-muted-foreground">A partir de</dt>
              <dd className="font-bold text-highlight" data-testid="admin-nft-price">
                {formatEth(nft.price)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">À venda</dt>
              <dd>{nft.available}</dd>
            </div>
          </dl>
          <div className="flex items-center gap-2">
            <FeaturedToggle nft={nft} />
            <Button variant="outline" size="sm" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)} className="h-9">
              Edições ({nft.editions.length})
              <ChevronDown className={cn('transition-transform duration-200 motion-reduce:transition-none', open && 'rotate-180')} aria-hidden="true" />
              <span className="sr-only"> de {nft.name}</span>
            </Button>
          </div>
        </div>
      </div>
      {open && (
        <div id={panelId} className="border-t border-[var(--kp-linha)] px-4 pb-2">
          <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_88px] gap-4 pt-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle-foreground md:grid">
            <span>Edição</span>
            <span>Preço</span>
            <span>Disponível</span>
            <span>Status</span>
            <span />
          </div>
          <ul aria-label={`Edições de ${nft.name}`}>
            {nft.editions.map((e) => (
              <li
                key={e.id}
                className="grid grid-cols-2 items-center gap-x-4 gap-y-2 border-b border-border/60 py-3 last:border-b-0 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_88px]"
                data-testid="admin-edition"
                data-edition-id={e.id}
              >
                <p className="col-span-2 text-[14px] font-semibold md:col-span-1">
                  Edição {e.name} <span className="font-normal text-muted-foreground">· tiragem {e.supply}</span>
                </p>
                <dl className="contents text-[14px]">
                  <div>
                    <dt className="text-[12px] text-muted-foreground md:sr-only">Preço</dt>
                    <dd className="break-all" data-testid="admin-edition-price">
                      {exactEth(e.price)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[12px] text-muted-foreground md:sr-only">Disponível</dt>
                    <dd>
                      {e.available} de {e.supply}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[12px] text-muted-foreground md:sr-only">Status</dt>
                    <dd>
                      <StatusBadge status={e.status} />
                    </dd>
                  </div>
                </dl>
                <Button variant="outline" size="sm" className="justify-self-end" onClick={() => onEdit(e.id)}>
                  Editar<span className="sr-only"> edição {e.name} de {nft.name}</span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  )
}

function StatusBadge({ status }: { status: Edition['status'] }) {
  return <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[12px] font-semibold leading-4', STATUS_CLASS[status])}>{STATUS_LABEL[status]}</span>
}

/** Destaque na vitrine: otimista (muda na hora) com rollback se a API recusar. */
function FeaturedToggle({ nft }: { nft: NftDetail }) {
  const toggle = useToggleFeatured()
  return (
    <button
      type="button"
      aria-pressed={nft.featured}
      aria-label={`Destaque na vitrine: ${nft.name}`}
      disabled={toggle.isPending}
      onClick={() => toggle.mutate({ nft, featured: !nft.featured })}
      data-testid="featured-toggle"
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
        nft.featured ? 'border-primary bg-primary/15 text-highlight' : 'border-border text-muted-foreground hover:border-primary/70 hover:text-foreground',
      )}
    >
      <Star className={cn('size-4', nft.featured && 'fill-current')} aria-hidden="true" />
      {nft.featured ? 'Em destaque' : 'Destacar'}
    </button>
  )
}

const editionFields = ['price', 'available', 'status'] as const

function formValues(e: Edition): AdminEditionForm {
  return { price: e.price, available: String(e.available), status: e.status === 'unavailable' ? 'unavailable' : 'on_sale' }
}

/**
 * Diálogo de edição. `baseVersion` é a versão do NFT quando os valores do formulário foram carregados; é ela
 * que vai para a API. Se o NFT mudar com o diálogo aberto (evento ao vivo), avisa antes de salvar; se a API
 * recusar (409), mostra o que está valendo e deixa escolher entre usar os valores atuais ou salvar os seus.
 */
function EditionDialog({ nft, editionId, onDone }: { nft: NftDetail; editionId: string; onDone: () => void }) {
  const edition = nft.editions.find((e) => e.id === editionId) ?? nft.editions[0]
  const [baseVersion, setBaseVersion] = useState(nft.version)
  const [conflict, setConflict] = useState<NftDetail | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const update = useUpdateEdition()
  const label = `Edição ${edition.name} de ${nft.name}`

  const form = useForm<AdminEditionForm>({ resolver: zodResolver(AdminEditionForm), defaultValues: formValues(edition) })
  const { register, handleSubmit, control, formState, reset, setError } = form

  const changedMeanwhile = !conflict && !update.isPending && nft.version !== baseVersion
  const loadCurrent = (current: NftDetail) => {
    const e = current.editions.find((x) => x.id === editionId) ?? edition
    reset(formValues(e))
    setBaseVersion(current.version)
    setConflict(null)
    setFormError(null)
  }

  const submit = handleSubmit((values) => {
    setFormError(null)
    const available = Number(values.available)
    if (available > edition.supply) {
      setError('available', { type: 'validate', message: `Máximo de ${edition.supply} (tiragem da edição)` }, { shouldFocus: true })
      return
    }
    update.mutate(
      { nftId: nft.id, editionId: edition.id, patch: { version: baseVersion, price: values.price.trim(), available, status: values.status }, label },
      {
        onSuccess: onDone,
        onError: (error) => {
          const current = versionConflictOf(error)
          if (current) {
            setConflict(current)
            return
          }
          if (error instanceof ApiError && applyApiFieldErrors(error.fields, setError, editionFields)) return
          setFormError(error instanceof ApiError ? error.message : 'Não foi possível salvar. Tente novamente.')
        },
      },
    )
  })

  const conflictEdition = conflict?.editions.find((x) => x.id === editionId)

  return (
    <DialogContent className="max-h-[90dvh] overflow-y-auto border-border bg-card sm:max-w-md" data-testid="edition-dialog">
      <DialogHeader>
        <DialogTitle>Editar edição {edition.name}</DialogTitle>
        <DialogDescription>
          {nft.name} · tiragem de {edition.supply}. Ao salvar, quem está vendo ou comprando recebe os valores novos na hora.
        </DialogDescription>
      </DialogHeader>

      {changedMeanwhile && (
        <div role="status" className="rounded-md border border-warning/50 bg-warning/10 p-3 text-[13px] leading-5" data-testid="edition-changed">
          <p>Este NFT acabou de mudar (outra aba, outro admin ou uma compra). Carregue os valores atuais antes de salvar.</p>
          <button type="button" className="mt-1 font-semibold text-highlight underline-offset-4 hover:underline" onClick={() => loadCurrent(nft)}>
            Carregar valores atuais
          </button>
        </div>
      )}

      {conflict && conflictEdition && (
        <div role="alert" className="rounded-md border border-destructive/60 bg-destructive/10 p-3 text-[13px] leading-5" data-testid="edition-conflict">
          <p className="font-semibold">Não salvamos: o NFT mudou desde que você abriu a edição.</p>
          <p className="mt-1 text-muted-foreground">
            Agora no servidor: {exactEth(conflictEdition.price)} · {conflictEdition.available} de {conflictEdition.supply} disponíveis · {STATUS_LABEL[conflictEdition.status]}.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => loadCurrent(conflict)}>
              Usar os valores atuais
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setBaseVersion(conflict.version)
                setConflict(null)
              }}
            >
              Manter os meus e revisar
            </Button>
          </div>
        </div>
      )}

      <form id="edition-form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <FormField label="Preço (ETH)" inputMode="decimal" autoComplete="off" required error={formState.errors.price?.message} hint="Ponto como separador, ex.: 1.25" {...register('price')} />
        <FormField
          label="Disponível para venda"
          inputMode="numeric"
          autoComplete="off"
          required
          error={formState.errors.available?.message}
          hint={`De 0 a ${edition.supply}. Com 0 a edição fica esgotada.`}
          {...register('available')}
        />
        <fieldset>
          <legend className="mb-2 text-[14px] leading-4">Status</legend>
          <Controller
            control={control}
            name="status"
            render={({ field }) => (
              <div role="radiogroup" aria-label="Status da edição" className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['on_sale', 'À venda', 'Esgota sozinha com 0'],
                    ['unavailable', 'Indisponível', 'Fora de venda'],
                  ] as const
                ).map(([value, text, hint]) => (
                  <label
                    key={value}
                    className={cn(
                      'flex cursor-pointer flex-col rounded-[2px] border px-3 py-2 text-[14px] transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                      field.value === value ? 'border-primary bg-primary/10' : 'border-[var(--kp-campo-borda)] hover:border-primary/60',
                    )}
                  >
                    <input type="radio" name={field.name} value={value} checked={field.value === value} onChange={() => field.onChange(value)} onBlur={field.onBlur} className="sr-only" />
                    <span className="font-semibold">{text}</span>
                    <span className="text-[12px] text-muted-foreground">{hint}</span>
                  </label>
                ))}
              </div>
            )}
          />
        </fieldset>
        {formError && (
          <p role="alert" className="text-[13px] text-destructive">
            ⚠ {formError}
          </p>
        )}
      </form>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={update.isPending}>
          Cancelar
        </Button>
        <Button type="submit" form="edition-form" className={cn(primaryButton, 'self-auto px-8')} disabled={update.isPending || Boolean(conflict) || !formState.isDirty} data-testid="edition-save">
          {update.isPending ? 'Salvando…' : 'Salvar'}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
