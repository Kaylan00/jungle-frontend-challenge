/**
 * Painel administrativo (/admin): NFTs (preço, disponibilidade e status de cada edição, destaque) e cupons.
 *
 * Acesso: a rota fica sob o layout protegido (sem sessão → login). O papel NÃO é decidido aqui: a página
 * chama a API e é ela que responde 403 FORBIDDEN para conta comum; nesse caso aparece "Sem permissão".
 * Toda mudança vai pela API simulada, que grava, recalcula carrinhos e emite nft.updated pelo Socket.IO
 * (inclusive para as outras abas abertas).
 */
import { Link, useNavigate } from '@tanstack/react-router'
import { ShieldAlert } from 'lucide-react'
import { ApiError } from '@/api/http'
import { ADMIN_PAGE_SIZE } from '@/api/queries'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AdminCoupons } from './admin-coupons'
import { AdminNfts } from './admin-nfts'
import { useAdminCoupons, useAdminNfts } from './hooks'

export interface AdminSearch {
  aba?: 'nfts' | 'cupons'
  q?: string
  pagina?: number
}

const TABS = [
  { id: 'nfts', label: 'NFTs e edições' },
  { id: 'cupons', label: 'Cupons' },
] as const

export function AdminPage({ search }: { search: AdminSearch }) {
  const navigate = useNavigate()
  const tab = search.aba ?? 'nfts'
  const params = { q: search.q || undefined, page: search.pagina, pageSize: ADMIN_PAGE_SIZE }
  const nfts = useAdminNfts(params, tab === 'nfts')
  const coupons = useAdminCoupons(tab === 'cupons')
  const forbidden = [nfts.error, coupons.error].some((e) => e instanceof ApiError && e.code === 'FORBIDDEN')

  if (forbidden) return <NoPermission />

  const selectTab = (id: (typeof TABS)[number]['id']) =>
    void navigate({ to: '/admin', search: id === 'nfts' ? {} : { aba: id }, replace: true, resetScroll: false })

  return (
    <div className="container-page py-6 md:pb-16 md:pt-8">
      <header className="flex flex-col gap-1 border-b border-border pb-5">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#b39463]">Administração</p>
        <h1 className="text-[22px] font-bold leading-8 md:text-[28px]">Painel</h1>
        <p className="max-w-2xl text-[14px] leading-5 text-muted-foreground">
          Preços, disponibilidade, destaques e cupons. Cada mudança é gravada pela API e chega ao vivo a quem está navegando ou comprando, inclusive em outras abas.
        </p>
      </header>

      {/* Abas com o mesmo visual das abas do detalhe (setas trocam de aba; a aba ativa vai na URL). */}
      <div role="tablist" aria-label="Seções do painel" className="mt-5 flex gap-6 border-b border-border text-[14px] md:gap-8 md:text-[15px]">
        {TABS.map((t, i) => {
          const selected = t.id === tab
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`admin-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`admin-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => selectTab(t.id)}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
                e.preventDefault()
                const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]
                selectTab(next.id)
                document.getElementById(`admin-tab-${next.id}`)?.focus()
              }}
              className={cn(
                '-mb-px border-b-2 border-transparent pb-2 transition-colors duration-200 hover:text-highlight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:border-b-[3px]',
                selected && 'border-primary font-semibold text-highlight',
              )}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      <section role="tabpanel" id={`admin-panel-${tab}`} aria-labelledby={`admin-tab-${tab}`} className="pt-6">
        {tab === 'nfts' ? <AdminNfts query={nfts} search={search} /> : <AdminCoupons query={coupons} />}
      </section>
    </div>
  )
}

/** 403 da API: conta logada sem papel de admin. */
function NoPermission() {
  return (
    <section className="container-page flex min-h-[50vh] flex-col items-center justify-center gap-4 py-16 text-center" aria-labelledby="forbidden-title" data-testid="admin-forbidden">
      <ShieldAlert className="size-8 text-warning" aria-hidden="true" />
      <p className="text-sm font-semibold text-primary">Erro 403</p>
      <h1 id="forbidden-title" className="text-2xl font-bold uppercase md:text-3xl">
        Sem permissão
      </h1>
      <p className="max-w-md text-muted-foreground">O painel é só para administradores da Kurio. Sua conta continua com acesso ao catálogo, ao carrinho e ao seu perfil.</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link to="/" className={buttonVariants()}>
          Voltar para o início
        </Link>
        <Link to="/perfil" className={buttonVariants({ variant: 'outline' })}>
          Ir para o meu perfil
        </Link>
      </div>
    </section>
  )
}
