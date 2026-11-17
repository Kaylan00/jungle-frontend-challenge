import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

/**
 * A camada de mocks (MSW) é ligada por configuração (VITE_ENABLE_MOCKS) e iniciada
 * ANTES de carregar o app, por dois motivos:
 *  1. nenhuma requisição sai antes do "servidor" simulado estar pronto;
 *  2. o engine.io (dentro do socket.io-client) guarda a classe WebSocket no momento em que o
 *     módulo é carregado. Se o app fosse importado antes, ele pegaria o WebSocket original e o
 *     MSW não conseguiria interceptar a conexão. Por isso o app é importado dinamicamente depois.
 * Com mocks desligados, nada do MSW entra no bundle principal.
 */
async function bootstrap() {
  if (import.meta.env.VITE_ENABLE_MOCKS === 'true') {
    const { startMocks } = await import('./mocks/browser')
    await startMocks()
  }
  const { App } = await import('./app/app')
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
