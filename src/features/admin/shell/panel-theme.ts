/**
 * TEMA do Kurio Admin: "Escuro" (padrão), "Claro" ou "Igual ao sistema" (prefers-color-scheme, acompanha a
 * troca no sistema com o painel aberto). Vale só no painel: a loja continua escura.
 *
 * - A escolha fica no localStorage (sem storage, vale só nesta visita) e é sincronizada entre abas.
 * - O tema resolvido vai para <html data-kp-tema="claro|escuro"> enquanto o painel está montado (os diálogos,
 *   avisos e dicas são renderizados fora da casca, no <body>, e também precisam das cores). Ao sair do painel
 *   o atributo sai e a loja volta às cores dela.
 * - Sem piscar: main.tsx chama applyPanelThemeEarly() antes de qualquer coisa (o fundo já nasce no tema certo,
 *   inclusive enquanto os mocks e o app carregam), e a raiz do painel aplica o atributo num layout effect, antes
 *   da primeira pintura. Nada de script inline (a CSP do vercel.json só aceita script do próprio site).
 */
import { useCallback, useSyncExternalStore } from 'react'
import { isPanelPath } from '../panel-path'
import './panel-theme.css'

export type PanelThemeChoice = 'escuro' | 'claro' | 'sistema'
export type PanelTheme = 'escuro' | 'claro'

export const PANEL_THEME_KEY = 'kurio.admin.tema'
const ATTR = 'data-kp-tema'

export const PANEL_THEME_OPTIONS: ReadonlyArray<{ value: PanelThemeChoice; label: string; short: string }> = [
  { value: 'escuro', label: 'Escuro', short: 'escuro' },
  { value: 'claro', label: 'Claro', short: 'claro' },
  { value: 'sistema', label: 'Igual ao sistema', short: 'igual ao sistema' },
]

const isChoice = (v: unknown): v is PanelThemeChoice => v === 'escuro' || v === 'claro' || v === 'sistema'

export function readPanelThemeChoice(): PanelThemeChoice {
  try {
    const v = localStorage.getItem(PANEL_THEME_KEY)
    return isChoice(v) ? v : 'escuro'
  } catch {
    return 'escuro'
  }
}

const systemQuery = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: light)') : null)

export function resolvePanelTheme(choice: PanelThemeChoice): PanelTheme {
  if (choice === 'sistema') return systemQuery()?.matches ? 'claro' : 'escuro'
  return choice
}

/** Primeiro passo do app (main.tsx): só em endereço do painel, põe o tema gravado no <html> antes de pintar. */
export function applyPanelThemeEarly() {
  if (!isPanelPath(window.location.pathname)) return
  document.documentElement.setAttribute(ATTR, resolvePanelTheme(readPanelThemeChoice()))
}

/** Raiz do painel: aplica o tema no <html> (e tira ao sair do painel). */
export function setPanelThemeAttr(theme: PanelTheme | null) {
  const root = document.documentElement
  if (theme) root.setAttribute(ATTR, theme)
  else root.removeAttribute(ATTR)
}

// ---------- Loja externa (useSyncExternalStore): escolha + sistema + outras abas ----------

const listeners = new Set<() => void>()
let memoryChoice: PanelThemeChoice | null = null
const emit = () => listeners.forEach((l) => l())

function subscribe(listener: () => void) {
  listeners.add(listener)
  const mq = systemQuery()
  const onStorage = (e: StorageEvent) => {
    if (e.key === PANEL_THEME_KEY || e.key === null) {
      memoryChoice = null
      listener()
    }
  }
  mq?.addEventListener('change', listener)
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    mq?.removeEventListener('change', listener)
    window.removeEventListener('storage', onStorage)
  }
}

const currentChoice = () => memoryChoice ?? readPanelThemeChoice()
// Instantâneo como string (estável entre leituras iguais): "escolha:resolvido".
const snapshot = () => {
  const choice = currentChoice()
  return `${choice}:${resolvePanelTheme(choice)}`
}

/** Troca com transição de cor curta (só sem "reduzir movimento"); a classe sai sozinha. */
let transitionTimer: ReturnType<typeof setTimeout> | undefined
function withColorTransition(apply: () => void) {
  const root = document.documentElement
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (!reduce) {
    root.classList.add('kp-tema-trocando')
    clearTimeout(transitionTimer)
    transitionTimer = setTimeout(() => root.classList.remove('kp-tema-trocando'), 420)
  }
  apply()
}

export function setPanelThemeChoice(choice: PanelThemeChoice) {
  withColorTransition(() => {
    memoryChoice = choice
    try {
      localStorage.setItem(PANEL_THEME_KEY, choice)
    } catch {
      /* sem storage: vale só nesta visita (memoryChoice) */
    }
    emit()
  })
}

export function usePanelTheme() {
  const value = useSyncExternalStore(subscribe, snapshot, () => 'escuro:escuro')
  const [choice, theme] = value.split(':') as [PanelThemeChoice, PanelTheme]
  const setChoice = useCallback((c: PanelThemeChoice) => setPanelThemeChoice(c), [])
  return { choice, theme, setChoice }
}
