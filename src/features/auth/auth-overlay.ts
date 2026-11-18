import { useNavigate, useRouter, useRouterState, type NavigateOptions, type ParsedLocation } from '@tanstack/react-router'
import { createContext, useCallback, useRef } from 'react'
import { authSearchSchema, closeTarget, isPrivatePath, type AuthSearch } from './auth-search'

/**
 * Telas de conta (entrar, criar conta, recuperar senha) POR CIMA da página onde a pessoa estava.
 *
 * Quando algo pede conta numa página pública (finalizar compra no carrinho, favoritar no detalhe, perfil pela
 * barra inferior...), o app não troca de página: continua na página de origem e abre a janela de conta sobre
 * ela. A barra de endereço mostra /login?redirect=... (máscara de rota do TanStack Router), mas a rota de
 * verdade é a de origem com as chaves abaixo na busca. Por isso:
 *  - o fundo é a própria página de origem, já montada: nada é buscado de novo nem duplicado, e ela fica
 *    inerte (inert + aria-hidden do Dialog), sem foco;
 *  - voltar/avançar do navegador funcionam (o histórico guarda a rota de verdade);
 *  - refresh ou acesso direto a /login caem na rota /login comum, com o início ao fundo (`unmaskOnReload`);
 *  - origem privada (ex.: sessão expirou em /pagamento) ou outra tela de conta também usam a rota comum.
 */
export type AuthMode = 'login' | 'signup' | 'forgot'

export const AUTH_PATH = { login: '/login', signup: '/cadastro', forgot: '/recuperar-senha' } as const

const ACCOUNT_PATHS = ['/login', '/cadastro', '/recuperar-senha', '/redefinir-senha']
const OVERLAY_KEYS = ['auth', 'authRedirect', 'authReason', 'authFrom'] as const

type Loc = Pick<ParsedLocation, 'pathname' | 'search' | 'hash'> & { state?: unknown }

export interface AuthOverlay {
  mode: AuthMode
  search: AuthSearch
  /** Página de origem (a que fica ao fundo), sem as chaves da janela de conta. */
  origin: { pathname: string; search: Record<string, unknown>; hash: string }
  /** Posição da origem no histórico: fechar volta de verdade (history.back) quando ela está logo atrás. */
  from?: number
}

/**
 * Quem abriu a janela sobre a página (botão "Conectar e finalizar", coração, "Entrar"...). A página fica
 * inerte enquanto a janela está aberta, então o Radix não devolve o foco sozinho: ao fechar, a moldura
 * (auth-dialog.tsx) devolve para cá. Vale também entre trocas de tela dentro da janela.
 */
export const AuthReturnFocus = createContext<HTMLElement | null>(null)

/** A janela de conta pode abrir por cima desta página? (privadas e telas de conta, não) */
export function canHostAuthOverlay(pathname: string) {
  if (isPrivatePath(pathname)) return false
  return !ACCOUNT_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

function stripOverlayKeys(search: Record<string, unknown>) {
  const rest = { ...search }
  for (const key of OVERLAY_KEYS) delete rest[key]
  return rest
}

function historyIndex(state: unknown) {
  const index = (state as { __TSR_index?: unknown } | undefined)?.__TSR_index
  return typeof index === 'number' ? index : undefined
}

/** Lê a janela de conta aberta sobre a página atual (ou null). Valida tudo: `redirect` só aceita caminho interno. */
export function readAuthOverlay(location: Loc): AuthOverlay | null {
  const raw = location.search as Record<string, unknown>
  const mode = raw.auth
  if (mode !== 'login' && mode !== 'signup' && mode !== 'forgot') return null
  if (!canHostAuthOverlay(location.pathname)) return null
  return {
    mode,
    search: authSearchSchema.parse({ redirect: raw.authRedirect, reason: raw.authReason }),
    origin: { pathname: location.pathname, search: stripOverlayKeys(raw), hash: location.hash },
    from: typeof raw.authFrom === 'number' ? raw.authFrom : undefined,
  }
}

function cleanSearch(search: AuthSearch): AuthSearch {
  return { redirect: search.redirect || undefined, reason: search.reason || undefined }
}

/**
 * Navegação para uma tela de conta a partir de `origin` (a página atual, ou a última resolvida no guard).
 * Página pública: janela por cima dela (máscara /login). Sem origem, origem privada ou tela de conta: rota comum.
 */
export function authNavigation(origin: Loc | undefined, mode: AuthMode, search: AuthSearch): NavigateOptions {
  const authSearch = cleanSearch(search)
  if (!origin || !canHostAuthOverlay(origin.pathname)) {
    return { to: AUTH_PATH[mode], search: authSearch } as NavigateOptions
  }
  // Trocar de tela dentro da janela (entrar ↔ criar conta) mantém a origem e a posição dela no histórico.
  const current = readAuthOverlay(origin)
  const from = current ? current.from : historyIndex(origin.state)
  return {
    to: origin.pathname,
    search: {
      ...stripOverlayKeys(origin.search as Record<string, unknown>),
      auth: mode,
      authRedirect: authSearch.redirect,
      authReason: authSearch.reason,
      authFrom: from,
    },
    hash: origin.hash || undefined,
    // A barra mostra a tela de conta; no refresh vale o que ela mostra (rota /login comum).
    mask: { to: AUTH_PATH[mode], search: authSearch, unmaskOnReload: true },
    resetScroll: false,
  } as unknown as NavigateOptions
}

/** Abre a tela de conta sobre a página atual (ex.: favoritar sem conta). */
export function useOpenAuth() {
  const router = useRouter()
  const navigate = useNavigate()
  return useCallback(
    (search: AuthSearch, mode: AuthMode = 'login') => void navigate(authNavigation(router.state.location, mode, search)),
    [navigate, router],
  )
}

/** A janela de conta está aberta sobre a página atual? (o RootLayout deixa a página inerte) */
export function useAuthOverlay() {
  const location = useRouterState({ select: (s) => s.location })
  return readAuthOverlay(location)
}

/**
 * Navegação de dentro das telas de conta, igual nos dois jeitos de abrir (rota comum ou sobre a origem):
 *  - `link(mode)`: outra tela de conta (substitui a entrada do histórico, mantém o fundo);
 *  - `close()`: X/Esc. Sobre a origem: volta para ela. Rota comum: origem pública ou início;
 *  - `finish()`: depois de entrar/criar conta, segue para `redirect` (ou para a origem).
 */
export function useAuthFlow(search: AuthSearch) {
  const router = useRouter()
  const navigate = useNavigate()
  const location = useRouterState({ select: (s) => s.location })
  const overlay = readAuthOverlay(location)
  // Sair uma vez só: o login dispara o onDone do formulário e a mudança de `user`; Esc repetido não volta duas páginas.
  const leaving = useRef(false)
  const once = (fn: () => void) => () => {
    if (leaving.current) return
    leaving.current = true
    fn()
  }

  const link = (mode: AuthMode, next: AuthSearch = search): NavigateOptions => ({ ...authNavigation(location, mode, next), replace: true })

  const backToOrigin = (o: AuthOverlay) => {
    // A entrada logo atrás no histórico é a origem: voltar de verdade (o botão "voltar" não repete a página).
    if (o.from !== undefined && historyIndex(router.history.location.state) === o.from + 1) {
      router.history.back()
      return
    }
    void navigate({ to: o.origin.pathname, search: o.origin.search, hash: o.origin.hash || undefined, replace: true, resetScroll: false } as NavigateOptions)
  }

  const close = once(() => (overlay ? backToOrigin(overlay) : void navigate({ to: closeTarget(search.redirect), replace: true })))

  const finish = once(() => {
    const target = search.redirect
    if (overlay) {
      const originHref = router.buildLocation({ to: overlay.origin.pathname, search: overlay.origin.search, hash: overlay.origin.hash || undefined } as NavigateOptions).href
      if (!target || target === originHref) return backToOrigin(overlay)
    }
    void navigate({ to: target ?? '/', replace: true })
  })

  return { overlay, link, close, finish }
}
