import { createContext, useContext, useSyncExternalStore } from 'react'
import type { RealtimeClient, RealtimeStatus } from './client'

/** Cliente de tempo real da aba (null antes de o RealtimeProvider montar ou depois de desmontar). */
export const RealtimeContext = createContext<RealtimeClient | null>(null)

export function useRealtimeClient() {
  return useContext(RealtimeContext)
}

const noop = () => () => {}
const connecting = (): RealtimeStatus => 'connecting'

export function useRealtimeStatus(): RealtimeStatus {
  const client = useRealtimeClient()
  return useSyncExternalStore(client?.subscribeStatus ?? noop, client?.getStatus ?? connecting, client?.getStatus ?? connecting)
}
