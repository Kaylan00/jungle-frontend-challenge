/**
 * USUÁRIOS (somente leitura): GET /admin/users. O servidor já manda sem dado sensível: sem senha, sessões,
 * carteiras, avatar nem e-mail completo (vem mascarado). O painel lista para dar contexto aos pedidos; mudar
 * conta ou papel não é tarefa desta tela.
 * Carregando (primeira leitura, busca ou página): a mesma tabela com linhas skeleton e a contagem também em
 * skeleton, para nada mudar de lugar quando a resposta chega.
 */
import { useNavigate } from '@tanstack/react-router'
import { Eye, ShieldCheck } from 'lucide-react'
import { ApiError } from '@/api/http'
import { EmptyState, ErrorState } from '@/components/shared/error-state'
import { cn } from '@/lib/utils'
import { useAdminUsers } from '../hooks'
import { PanelPage } from '../shell/panel-page'
import { sectionMeta } from '../shell/sections'
import { LoadingNote, Pager, SectionSearch, Sk, SkBlock } from './ui'
import { useDebouncedSearch } from './ui-utils'

export interface UsersSearch {
  q?: string
  pagina?: number
}

const PAGE_SIZE = 10
const META = sectionMeta('/admin/usuarios')

const since = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric' })

const cell = 'px-4 py-3 align-middle max-md:flex max-md:items-baseline max-md:justify-between max-md:gap-4 max-md:px-0 max-md:py-1 max-md:before:shrink-0 max-md:before:text-[12px] max-md:before:text-[var(--kp-fumaca)] max-md:before:content-[attr(data-label)]'

export function UsersSection({ search }: { search: UsersSearch }) {
  const navigate = useNavigate()
  const users = useAdminUsers({ q: search.q || undefined, page: search.pagina, pageSize: PAGE_SIZE })
  const [term, setTerm] = useDebouncedSearch(search.q, (q) => void navigate({ to: '/admin/usuarios', search: { q }, replace: true, resetScroll: false }))

  const loading = (!users.data && !users.isError) || users.isPlaceholderData
  const goToPage = (p: number) => void navigate({ to: '/admin/usuarios', search: (prev) => ({ ...prev, pagina: p > 1 ? p : undefined }), resetScroll: false })

  return (
    <PanelPage eyebrow={META.eyebrow} title={META.label} description={META.intro} actions={<ReadOnlyBadge />}>
      <UsersToolbar term={term} onTerm={setTerm} total={loading ? undefined : users.data?.total} q={search.q} />

      {users.isError && !users.data ? (
        <ErrorState
          title="Não foi possível carregar os usuários"
          message={users.error instanceof ApiError ? users.error.message : undefined}
          onRetry={() => void users.refetch()}
          retrying={users.isFetching}
        />
      ) : loading || !users.data ? (
        <>
          <UsersTableSkeleton rows={users.data?.items.length || PAGE_SIZE} />
          {users.data && <Pager page={users.data.page} totalPages={users.data.totalPages} label="Páginas da lista de usuários" onPage={goToPage} />}
        </>
      ) : users.data.items.length === 0 ? (
        <EmptyState className="kp-ficha" title="Nenhuma conta encontrada" message="Busque pelo nome ou pelo nome de usuário (ex.: ana_nft)." />
      ) : (
        <>
          <div className="kp-ficha overflow-hidden">
            <table className="w-full border-collapse text-left text-[13.5px] max-md:block">
              <UsersHead />
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
          <Pager page={users.data.page} totalPages={users.data.totalPages} label="Páginas da lista de usuários" onPage={goToPage} />
        </>
      )}
    </PanelPage>
  )
}

export function ReadOnlyBadge() {
  return (
    <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--kp-linha)] px-3 text-[12px] text-[var(--kp-grafite)]">
      <Eye className="size-3.5" aria-hidden="true" />
      Somente leitura
    </span>
  )
}

/** Busca e contagem. Sem contagem ainda, ela aparece em skeleton no mesmo lugar (sem empurrar a lista). */
export function UsersToolbar({ term, onTerm, total, q, disabled }: { term: string; onTerm: (v: string) => void; total?: number; q?: string; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <SectionSearch id="users-search" label="Buscar usuário" value={term} onChange={onTerm} placeholder="Nome ou nome de usuário" disabled={disabled} />
      {total === undefined ? (
        <p className="text-[12.5px]">
          <Sk>00 contas</Sk>
        </p>
      ) : (
        <p className="text-[12.5px] text-[var(--kp-grafite)]" aria-live="polite">
          {total} {total === 1 ? 'conta' : 'contas'}
          {q ? ` para “${q}”` : ''}
        </p>
      )}
    </div>
  )
}

function UsersHead() {
  return (
    <>
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
    </>
  )
}

/** A tabela de usuários com linhas skeleton: mesma marcação e mesmas classes das linhas reais. */
export function UsersTableSkeleton({ rows }: { rows: number }) {
  return (
    <div className="kp-ficha overflow-hidden" aria-busy="true" data-testid="users-skeleton">
      <LoadingNote>Carregando usuários…</LoadingNote>
      <table className="w-full border-collapse text-left text-[13.5px] max-md:block" aria-hidden="true">
        <UsersHead />
        <tbody className="max-md:block">
          {Array.from({ length: rows }, (_, i) => (
            <tr key={i} className="border-b border-[var(--kp-linha)] last:border-b-0 max-md:block max-md:px-4 max-md:py-3">
              <th scope="row" data-label="Conta" className={cn(cell, 'font-normal')}>
                <span className="flex min-w-0 items-center gap-3">
                  <SkBlock className="size-9 shrink-0 rounded-full max-md:hidden" />
                  <span className="min-w-0 max-md:text-right">
                    <span className="block truncate font-semibold">
                      <Sk>{i % 2 ? 'Bruno Lima' : 'Ana Colecionadora'}</Sk>
                    </span>
                    <span className="block truncate text-[12px]">
                      <Sk>@ana_nft</Sk>
                    </span>
                  </span>
                </span>
              </th>
              <td data-label="E-mail" className={cell}>
                <Sk>a***@kurio.test</Sk>
              </td>
              <td data-label="Papel" className={cell}>
                <span className="text-[12.5px]">
                  <Sk>Cliente</Sk>
                </span>
              </td>
              <td data-label="Pedidos" className={cn(cell, 'text-right tabular-nums')}>
                <Sk>0</Sk>
              </td>
              <td data-label="Favoritos" className={cn(cell, 'text-right tabular-nums')}>
                <Sk>0</Sk>
              </td>
              <td data-label="Desde" className={cn(cell, 'whitespace-nowrap text-right text-[12.5px]')}>
                <Sk>jan. de 2026</Sk>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
