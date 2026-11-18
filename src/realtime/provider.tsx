import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { sessionQuery } from '@/api/queries'
import { RealtimeClient } from './client'
import { RealtimeContext } from './use-realtime'

/**
 * Um único socket por aba. Criado dentro do efeito e destruído na limpeza:
 * listeners e conexão são liberados quando o ciclo de vida termina (inclusive no StrictMode).
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [client, setClient] = useState<RealtimeClient | null>(null)
  const { data: session } = useQuery(sessionQuery)
  const userId = session?.user.id ?? null

  useEffect(() => {
    const c = new RealtimeClient(queryClient)
    c.start(null)
    // Sincronização com um sistema externo (o socket): o cliente nasce e morre com o efeito, e o estado só
    // publica a instância viva para os filhos. Criar no render vazaria a assinatura da sessão no StrictMode.
    // oxlint-disable-next-line react/set-state-in-effect
    setClient(c)
    return () => {
      c.dispose()
      setClient(null)
    }
  }, [queryClient])

  useEffect(() => {
    client?.setUser(userId)
  }, [client, userId])

  return <RealtimeContext.Provider value={client}>{children}</RealtimeContext.Provider>
}
