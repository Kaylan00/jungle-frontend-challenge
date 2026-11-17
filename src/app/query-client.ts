/**
 * Política de cache, retries e sincronização (documentada no ARCHITECTURE.md).
 *
 * - Retry automático só para falhas transitórias (rede, timeout, 5xx), até 2 vezes com backoff.
 *   4xx nunca é repetido: repetir não muda a resposta.
 * - Mutations não têm retry automático: repetir uma escrita só é seguro com idempotência,
 *   e o único fluxo que repete escrita (pedido) faz isso de forma explícita com a mesma chave.
 * - refetchOnWindowFocus ligado: volta para a aba = dados conferidos com a API.
 */
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/api/http'

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => error instanceof ApiError && error.isTransient && failureCount < 2,
        retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 4_000),
        refetchOnWindowFocus: true,
        staleTime: 15_000,
        gcTime: 5 * 60_000,
      },
      mutations: { retry: false },
    },
    queryCache: new QueryCache(),
    mutationCache: new MutationCache(),
  })
}
