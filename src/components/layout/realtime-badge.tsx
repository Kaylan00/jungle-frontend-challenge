import { useRealtimeStatus } from '@/realtime/use-realtime'
import { cn } from '@/lib/utils'

const LABEL = {
  connected: 'Ao vivo',
  connecting: 'Conectando',
  reconnecting: 'Reconectando',
  offline: 'Desconectado',
} as const

/**
 * Estado da conexão em tempo real. Não existe no Figma, então fica fora do cabeçalho:
 * um ponto discreto fixo no canto inferior direito. O texto do estado continua para leitor
 * de tela (sr-only) e no title ao passar o mouse (não depende só da cor).
 */
export function RealtimeBadge() {
  const status = useRealtimeStatus()
  return (
    <span
      className="fixed bottom-4 right-4 z-30 hidden items-center gap-1.5 rounded-full border border-border bg-card/90 p-1.5 text-xs text-muted-foreground shadow-sm lg:inline-flex"
      data-testid="realtime-status"
      data-status={status}
      title={`${LABEL[status]}: atualizações de preço e pedidos em tempo real`}
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
      <span className="sr-only">Conexão em tempo real: {LABEL[status]}</span>
    </span>
  )
}
