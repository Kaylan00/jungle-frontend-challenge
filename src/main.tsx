import { StrictMode, startTransition } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { applyPanelThemeEarly } from './features/admin/shell/panel-theme'

// Kurio Admin no tema claro: o fundo já nasce claro, antes dos mocks e do app carregarem (sem piscar o escuro).
applyPanelThemeEarly()

/**
 * A camada de mocks (MSW) é ligada por configuração (VITE_ENABLE_MOCKS) e iniciada
 * ANTES de carregar o app, por dois motivos:
 *  1. nenhuma requisição sai antes do "servidor" simulado estar pronto;
 *  2. o engine.io (dentro do socket.io-client) guarda a classe WebSocket no momento em que o
 *     módulo é carregado. Se o app fosse importado antes, ele pegaria o WebSocket original e o
 *     MSW não conseguiria interceptar a conexão. Por isso o app é importado dinamicamente depois.
 * Com mocks desligados, nada do MSW entra no bundle principal.
 * Alternativas medidas no Lighthouse (paralelo, renderizar antes, socket sob demanda) pioraram
 * o TBT no mobile; os números estão no ARCHITECTURE.md.
 */
async function bootstrap() {
  if (import.meta.env.VITE_ENABLE_MOCKS === 'true') {
    const { startMocks } = await import('./mocks/browser')
    await startMocks()
  }
  const { App } = await import('./app/app')
  const root = createRoot(document.getElementById('root')!)
  // Primeira renderização como transição: o React 19 a divide em fatias e devolve a thread ao navegador entre
  // elas, em vez de uma tarefa longa só (TBT no celular). O resultado na tela é o mesmo.
  startTransition(() => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
}

void bootstrap()
