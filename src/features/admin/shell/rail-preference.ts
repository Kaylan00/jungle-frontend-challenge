/** Trilho aberto ou recolhido: a escolha gravada (lida pela casca e pelo skeleton dela). */
export const RAIL_KEY = 'kurio.admin.trilho'

export function readRailPreference(): boolean | null {
  try {
    const v = localStorage.getItem(RAIL_KEY)
    return v === null ? null : v === 'recolhido'
  } catch {
    return null
  }
}

/** Recolhido por escolha gravada; sem escolha, recolhido na faixa entre tablet e notebook (768–1199px). */
export const initialRailCollapsed = () => readRailPreference() ?? window.matchMedia('(min-width: 768px) and (max-width: 1199px)').matches
