/** Endereços do Kurio Admin (painel à parte, no mesmo origin da loja). */
export const isPanelPath = (pathname: string) => pathname === '/admin' || pathname.startsWith('/admin/')
