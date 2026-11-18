import { useRealtimeStatus } from '@/realtime/use-realtime'
import { cn } from '@/lib/utils'

const LABEL = { connected: 'Ao vivo', connecting: 'Conectando', reconnecting: 'Reconectando', offline: 'Desconectado' } as const

/**
 * Estado do socket do painel, no cabeçalho da lousa (visível em qualquer largura). O texto acompanha a cor:
 * o estado nunca depende só do ponto verde.
 */
export function LiveStatus({ className }: { className?: string }) {
  const status = useRealtimeStatus()
  return (
    <span
      className={cn('inline-flex h-8 items-center gap-2 rounded-full border border-[var(--kp-linha)] px-3 text-[12px] text-[var(--kp-grafite)]', className)}
      data-testid="realtime-status"
      data-status={status}
      title="Preços, pedidos e atividade chegam pelo socket, sem recarregar"
    >
      <span
        aria-hidden="true"
        className={cn(
          'size-2 rounded-full',
          status === 'connected' && 'kp-pulso bg-success',
          (status === 'connecting' || status === 'reconnecting') && 'animate-pulse bg-warning',
          status === 'offline' && 'bg-destructive',
        )}
      />
      <span>
        <span className="sr-only">Conexão em tempo real: </span>
        {LABEL[status]}
      </span>
    </span>
  )
}
