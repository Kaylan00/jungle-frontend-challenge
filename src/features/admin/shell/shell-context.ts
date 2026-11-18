import { createContext, useContext } from 'react'

/** O que as páginas da lousa pedem à casca: abrir a busca global e o menu do celular. */
export interface PanelShellApi {
  openSearch: () => void
  openMenu: () => void
}

export const PanelShellContext = createContext<PanelShellApi>({ openSearch: () => {}, openMenu: () => {} })

export const usePanelShell = () => useContext(PanelShellContext)
