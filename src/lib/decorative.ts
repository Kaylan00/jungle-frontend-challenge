import { createContext, use } from 'react'

/**
 * Cópia só visual de uma página (ex.: a inicial atrás da janela de login, inerte e fora da árvore de
 * acessibilidade). Dentro dela os títulos não usam h1: cada página tem exatamente um h1, o da tela de verdade.
 */
export const DecorativeCopy = createContext(false)

export const useIsDecorativeCopy = () => use(DecorativeCopy)
