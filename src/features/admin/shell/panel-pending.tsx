/**
 * SKELETON DA CASCA: o que aparece enquanto o painel confere o acesso (GET /auth/session e GET /admin/me, no
 * beforeLoad de /admin/_painel). Em vez de uma tela vazia, a casca inteira já aparece no lugar certo: o trilho
 * (com a área marcada e o tema funcionando), o cabeçalho da seção pedida e o corpo dela em skeleton, com as
 * mesmas peças que a própria seção usa enquanto os dados chegam. Quando o acesso é confirmado, a casca real
 * entra por cima sem mover nada (e sem a animação de entrada, ver cameFromSkeleton).
 *
 * Nenhuma consulta do painel sai daqui (o acesso ainda não foi confirmado) e os controles que dependem da
 * sessão aparecem inativos. O leitor de tela recebe "Conferindo o acesso ao painel…".
 */
import { useRouterState } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ADMIN_PAGE_SIZE } from '@/api/queries'
import { cn } from '@/lib/utils'
import { AdminCoupons } from '../admin-coupons'
import { NftListSkeleton, NftsToolbar } from '../admin-nfts'
import { OrdersTableSkeleton, OrdersToolbar, type OrdersSearch } from '../sections/orders-section'
import { OverviewBody } from '../sections/overview-section'
import { LoadingNote, SkLines } from '../sections/ui'
import { ReadOnlyBadge, UsersTableSkeleton, UsersToolbar } from '../sections/users-section'
import { PanelPage } from './panel-page'
import './panel.css'
import { RailContent } from './rail'
import { initialRailCollapsed } from './rail-preference'
import { sectionFor } from './sections'
import { markSkeletonHandoff } from './shell-context'

const noop = () => undefined

export function PanelShellPending() {
  const location = useRouterState({ select: (s) => s.location })
  const section = sectionFor(location.pathname)
  const search = location.search as Record<string, unknown>
  const q = typeof search.q === 'string' ? search.q : ''
  const [collapsed] = useState(initialRailCollapsed)
  useEffect(() => () => markSkeletonHandoff(), [])

  return (
    <div className="kpanel flex h-dvh overflow-hidden md:gap-3 md:p-3 md:pl-0" data-testid="panel-shell-pending">
      <aside aria-label="Menu do painel" className={cn('hidden shrink-0 md:block', collapsed ? 'w-[76px]' : 'w-[256px]')}>
        <RailContent pending collapsed={collapsed} onToggle={noop} onSearch={noop} onLogout={noop} loggingOut={false} />
      </aside>

      <main aria-busy="true" className="kp-lousa relative min-w-0 flex-1 overflow-y-auto overscroll-contain outline-none max-md:border-0 md:rounded-[20px]">
        <LoadingNote>Conferindo o acesso ao painel…</LoadingNote>
        <PanelPage
          pending
          eyebrow={section.eyebrow}
          title={section.label}
          description={section.to === '/admin/cupons' ? <SkLines>{section.intro}</SkLines> : section.intro}
          actions={section.to === '/admin/usuarios' ? <ReadOnlyBadge /> : undefined}
        >
          {section.to === '/admin' && <OverviewBody />}
          {section.to === '/admin/nfts' && (
            <div className="flex flex-col gap-5">
              <NftsToolbar term={q} onTerm={noop} disabled />
              <NftListSkeleton rows={ADMIN_PAGE_SIZE} />
            </div>
          )}
          {section.to === '/admin/cupons' && <AdminCoupons />}
          {section.to === '/admin/pedidos' && (
            <>
              <OrdersToolbar search={search as OrdersSearch} term={q} onTerm={noop} disabled />
              <OrdersTableSkeleton rows={10} status={(search as OrdersSearch).status} />
            </>
          )}
          {section.to === '/admin/usuarios' && (
            <>
              <UsersToolbar term={q} onTerm={noop} disabled />
              <UsersTableSkeleton rows={10} />
            </>
          )}
        </PanelPage>
      </main>
    </div>
  )
}
