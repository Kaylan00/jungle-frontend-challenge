import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { sessionQuery } from '@/api/queries'
import { RealtimeClient, type RealtimeStatus } from './client'

const RealtimeContext = createContext<RealtimeClient | null>(null)

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

export function useRealtimeClient() {
  return useContext(RealtimeContext)
}

const noop = () => () => {}
const connecting = (): RealtimeStatus => 'connecting'

export function useRealtimeStatus(): RealtimeStatus {
  const client = useRealtimeClient()
  return useSyncExternalStore(client?.subscribeStatus ?? noop, client?.getStatus ?? connecting, client?.getStatus ?? connecting)
}
