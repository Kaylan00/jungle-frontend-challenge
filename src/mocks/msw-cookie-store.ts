/**
 * Substitui, só no navegador, o `cookieStore` interno do MSW (msw/lib/core/utils/cookieStore.mjs). Ligado
 * pelo plugin `mswLightCookieStore` do vite.config.ts.
 *
 * Por quê: o original usa o CookieJar do `tough-cookie`, que traz a lista de sufixos públicos (`tldts`,
 * ≈ 250 kB de JS, ≈ 2/3 do chunk dos mocks). Essa lista serve para decidir se um cookie com `Domain=` vale
 * para outro host. Aqui o servidor simulado e o app estão sempre na mesma origem e a API não usa cookies
 * (a sessão vai no cabeçalho Authorization). No navegador, o MSW já grava os `Set-Cookie` simulados em
 * `document.cookie` e lê `document.cookie` nas requisições; este armazenamento é o complemento que ele
 * mantém para o Node.
 *
 * Mantém o mesmo contrato do original: `getCookies(url)` devolve os cookies guardados para aquela origem e
 * caminho (objetos com `key`, `value` e `toString()`) e `setCookie(setCookieHeader, url)` guarda um cookie
 * (respeitando `Path`, `Max-Age` e `Expires`; `Max-Age=0` apaga). Fica só em memória.
 */
interface StoredCookie {
  key: string
  value: string
  path: string
  expiresAt: number | null
  toString(): string
}

const jar = new Map<string, Map<string, StoredCookie>>()

function defaultPath(pathname: string) {
  const i = pathname.lastIndexOf('/')
  return i <= 0 ? '/' : pathname.slice(0, i)
}

function pathMatches(requestPath: string, cookiePath: string) {
  return requestPath === cookiePath || (requestPath.startsWith(cookiePath) && (cookiePath.endsWith('/') || requestPath[cookiePath.length] === '/'))
}

function parseSetCookie(header: string, url: URL): StoredCookie | null {
  const [pair, ...attrs] = header.split(';')
  const eq = pair.indexOf('=')
  if (eq <= 0) return null
  const key = pair.slice(0, eq).trim()
  const value = pair.slice(eq + 1).trim()
  let path = defaultPath(url.pathname)
  let expiresAt: number | null = null
  for (const attr of attrs) {
    const [rawName, ...rest] = attr.split('=')
    const name = rawName.trim().toLowerCase()
    const v = rest.join('=').trim()
    if (name === 'path' && v.startsWith('/')) path = v
    else if (name === 'max-age' && /^-?\d+$/.test(v)) expiresAt = Date.now() + Number(v) * 1000
    else if (name === 'expires' && expiresAt === null) {
      const t = Date.parse(v)
      if (!Number.isNaN(t)) expiresAt = t
    }
  }
  return { key, value, path, expiresAt, toString: () => `${key}=${value}` }
}

export const cookieStore = {
  getCookies(url: string): StoredCookie[] {
    const { origin, pathname } = new URL(url)
    const cookies = jar.get(origin)
    if (!cookies) return []
    const now = Date.now()
    const result: StoredCookie[] = []
    for (const [id, c] of cookies) {
      if (c.expiresAt !== null && c.expiresAt <= now) cookies.delete(id)
      else if (pathMatches(pathname, c.path)) result.push(c)
    }
    return result
  },
  async setCookie(setCookieHeader: string, url: string): Promise<void> {
    const target = new URL(url)
    const cookie = parseSetCookie(setCookieHeader, target)
    if (!cookie) return
    const cookies = jar.get(target.origin) ?? new Map<string, StoredCookie>()
    jar.set(target.origin, cookies)
    const id = `${cookie.path};${cookie.key}`
    if (cookie.expiresAt !== null && cookie.expiresAt <= Date.now()) cookies.delete(id)
    else cookies.set(id, cookie)
  },
}
