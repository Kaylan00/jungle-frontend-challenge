import { createContext, useContext } from 'react'

/** O que as páginas da lousa pedem à casca: abrir a busca global e o menu do celular. */
export interface PanelShellApi {
  openSearch: () => void
  openMenu: () => void
}

export const PanelShellContext = createContext<PanelShellApi>({ openSearch: () => {}, openMenu: () => {} })

export const usePanelShell = () => useContext(PanelShellContext)

/*
 * Passagem do skeleton da casca (acesso sendo conferido) para a casca de verdade: o skeleton anota a hora em que
 * saiu da tela, e a seção que montar logo em seguida entra sem animação (as barras já ocupavam o lugar).
 */
let skeletonLeftAt = -Infinity
export function markSkeletonHandoff() {
  skeletonLeftAt = performance.now()
}
export const cameFromSkeleton = () => performance.now() - skeletonLeftAt < 400
