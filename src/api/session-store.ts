/**
 * Guarda mínima da sessão no navegador: apenas o token opaco e o id do carrinho de visitante.
 * Dados do usuário ficam no cache do TanStack Query (chave por usuário), nunca aqui.
 *
 * `epoch` muda a cada login/logout/expiração. Quem depende da sessão (socket, cache privado)
 * observa essa troca para descartar o que pertencia à sessão anterior.
 */

const TOKEN_KEY = 'jungle.session.token'
const GUEST_CART_KEY = 'jungle.cart.guest'

export type SessionChange = { reason: 'login' | 'logout' | 'expired' | 'restore'; epoch: number }

function read(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

let token = read(TOKEN_KEY)
let epoch = 0
let expired = false
const listeners = new Set<(c: SessionChange) => void>()

function notify(reason: SessionChange['reason']) {
  epoch += 1
  listeners.forEach((l) => l({ reason, epoch }))
}

export const sessionStore = {
  getToken: () => token,
  getEpoch: () => epoch,
  isExpired: () => expired,
  getGuestCartId: () => read(GUEST_CART_KEY),
  setGuestCartId: (id: string | null) => write(GUEST_CART_KEY, id),

  setToken(next: string) {
    token = next
    expired = false
    write(TOKEN_KEY, next)
    notify('login')
  },

  clear(reason: 'logout' | 'expired' = 'logout') {
    token = null
    expired = reason === 'expired'
    write(TOKEN_KEY, null)
    notify(reason)
  },

  /** Chamado pelo interceptor do Axios ao receber SESSION_EXPIRED. */
  markExpired() {
    if (!token) return
    this.clear('expired')
  },

  acknowledgeExpired() {
    expired = false
  },

  subscribe(fn: (c: SessionChange) => void) {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  },
}

// Outra aba fez login/logout: acompanha para não misturar usuários entre abas.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== TOKEN_KEY) return
    token = e.newValue
    notify(e.newValue ? 'login' : 'logout')
  })
}
