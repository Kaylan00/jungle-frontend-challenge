import { useRealtimeStatus } from '@/realtime/provider'
import { cn } from '@/lib/utils'

const LABEL = {
  connected: 'Ao vivo',
  connecting: 'Conectando',
  reconnecting: 'Reconectando',
  offline: 'Desconectado',
} as const

/** Estado da conexão em tempo real: texto + cor (não depende só da cor). */
export function RealtimeBadge() {
  const status = useRealtimeStatus()
  return (
    <span
      className="hidden items-center gap-1.5 text-xs text-muted-foreground lg:inline-flex"
      data-testid="realtime-status"
      data-status={status}
      title="Atualizações de preço e pedidos em tempo real"
    >
      <span
        aria-hidden="true"
        className={cn(
          'size-2 rounded-full',
          status === 'connected' && 'bg-success',
          (status === 'connecting' || status === 'reconnecting') && 'animate-pulse bg-warning',
          status === 'offline' && 'bg-destructive',
        )}
      />
      {LABEL[status]}
    </span>
  )
}
