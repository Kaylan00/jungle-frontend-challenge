/**
 * USUÁRIOS (somente leitura): GET /admin/users. O servidor já manda sem dado sensível: sem senha, sessões,
 * carteiras, avatar nem e-mail completo (vem mascarado). O painel lista para dar contexto aos pedidos; mudar
 * conta ou papel não é tarefa desta tela.
 */
import { useNavigate } from '@tanstack/react-router'
import { Eye, ShieldCheck } from 'lucide-react'
import { ApiError } from '@/api/http'
import { EmptyState, ErrorState } from '@/components/shared/error-state'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useAdminUsers } from '../hooks'
import { PanelPage } from '../shell/panel-page'
import { Pager, SectionSearch } from './ui'
import { useDebouncedSearch } from './ui-utils'

export interface UsersSearch {
  q?: string
  pagina?: number
}

const since = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric' })

const cell = 'px-4 py-3 align-middle max-md:flex max-md:items-baseline max-md:justify-between max-md:gap-4 max-md:px-0 max-md:py-1 max-md:before:shrink-0 max-md:before:text-[12px] max-md:before:text-[var(--kp-fumaca)] max-md:before:content-[attr(data-label)]'

export function UsersSection({ search }: { search: UsersSearch }) {
  const navigate = useNavigate()
  const users = useAdminUsers({ q: search.q || undefined, page: search.pagina, pageSize: 10 })
  const [term, setTerm] = useDebouncedSearch(search.q, (q) => void navigate({ to: '/admin/usuarios', search: { q }, replace: true, resetScroll: false }))

  return (
    <PanelPage
      eyebrow="Pessoas"
      title="Usuários"
      description="Contas da loja, para dar contexto aos pedidos. Somente leitura: sem senha, carteiras nem e-mail completo."
      actions={
        <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--kp-linha)] px-3 text-[12px] text-[var(--kp-grafite)]">
          <Eye className="size-3.5" aria-hidden="true" />
          Somente leitura
        </span>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionSearch id="users-search" label="Buscar usuário" value={term} onChange={setTerm} placeholder="Nome ou nome de usuário" />
        {users.data && (
          <p className="text-[12.5px] text-[var(--kp-grafite)]" aria-live="polite">
            {users.data.total} {users.data.total === 1 ? 'conta' : 'contas'}
            {search.q ? ` para “${search.q}”` : ''}
          </p>
        )}
      </div>

      {!users.data && !users.isError ? (
        <div className="kp-ficha flex flex-col gap-4 p-5" aria-busy="true" aria-label="Carregando usuários">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-center gap-4" aria-hidden="true">
              <Skeleton className="size-9 rounded-full" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="hidden h-4 w-32 md:block" />
            </div>
          ))}
        </div>
      ) : !users.data ? (
        <ErrorState
          title="Não foi possível carregar os usuários"
          message={users.error instanceof ApiError ? users.error.message : undefined}
          onRetry={() => void users.refetch()}
          retrying={users.isFetching}
        />
      ) : users.data.items.length === 0 ? (
        <EmptyState className="kp-ficha" title="Nenhuma conta encontrada" message="Busque pelo nome ou pelo nome de usuário (ex.: ana_nft)." />
      ) : (
        <>
          <div className={cn('kp-ficha overflow-hidden transition-opacity', users.isPlaceholderData && 'opacity-60')} aria-busy={users.isPlaceholderData || undefined}>
            <table className="w-full border-collapse text-left text-[13.5px] max-md:block">
              <caption className="sr-only">Usuários da loja</caption>
              <thead className="border-b border-[var(--kp-linha)] text-[11px] uppercase tracking-[0.12em] text-[var(--kp-fumaca)] max-md:sr-only">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Conta</th>
                  <th scope="col" className="px-4 py-3 font-semibold">E-mail</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Papel</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Pedidos</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Favoritos</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Desde</th>
                </tr>
              </thead>
              <tbody className="max-md:block" data-testid="admin-user-list">
                {users.data.items.map((u) => (
                  <tr key={u.id} className="border-b border-[var(--kp-linha)] last:border-b-0 max-md:block max-md:px-4 max-md:py-3" data-testid="admin-user" data-username={u.username}>
                    <th scope="row" data-label="Conta" className={cn(cell, 'font-normal')}>
                      <span className="flex min-w-0 items-center gap-3">
                        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full border border-[var(--kp-linha-forte)] text-[11px] font-bold text-[var(--kp-laranja-texto)] max-md:hidden">
                          {u.name.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="min-w-0 max-md:text-right">
                          <span className="block truncate font-semibold">{u.name}</span>
                          <span className="block truncate text-[12px] text-[var(--kp-fumaca)]">@{u.username}</span>
                        </span>
                      </span>
                    </th>
                    <td data-label="E-mail" className={cn(cell, 'text-[var(--kp-grafite)]')}>
                      {u.emailMasked}
                    </td>
                    <td data-label="Papel" className={cell}>
                      {u.role === 'admin' ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(210_138_76/0.5)] bg-[rgb(210_138_76/0.12)] px-2.5 py-0.5 text-[12px] font-semibold text-[var(--kp-laranja-texto)]">
                          <ShieldCheck className="size-3.5" aria-hidden="true" />
                          Administrador
                        </span>
                      ) : (
                        <span className="text-[12.5px] text-[var(--kp-grafite)]">Cliente</span>
                      )}
                    </td>
                    <td data-label="Pedidos" className={cn(cell, 'text-right tabular-nums')}>
                      {u.orders}
                    </td>
                    <td data-label="Favoritos" className={cn(cell, 'text-right tabular-nums')}>
                      {u.favorites}
                    </td>
                    <td data-label="Desde" className={cn(cell, 'whitespace-nowrap text-right text-[12.5px] text-[var(--kp-grafite)]')}>
                      {since.format(new Date(u.createdAt))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager
            page={users.data.page}
            totalPages={users.data.totalPages}
            label="Páginas da lista de usuários"
            onPage={(p) => void navigate({ to: '/admin/usuarios', search: (prev) => ({ ...prev, pagina: p > 1 ? p : undefined }), resetScroll: false })}
          />
        </>
      )}
    </PanelPage>
  )
}
