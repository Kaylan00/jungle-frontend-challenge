import { AlertTriangle, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function ErrorState({
  title = 'Algo deu errado',
  message,
  onRetry,
  retrying,
  className,
}: {
  title?: string
  message?: string
  onRetry?: () => void
  retrying?: boolean
  className?: string
}) {
  return (
    <div role="alert" className={cn('flex flex-col items-center gap-3 rounded-lg border border-border bg-card px-6 py-10 text-center', className)}>
      <AlertTriangle className="size-6 text-warning" aria-hidden="true" />
      <p className="font-semibold">{title}</p>
      {message && <p className="max-w-md text-sm text-muted-foreground">{message}</p>}
      {onRetry && (
        <Button variant="outline" onClick={onRetry} disabled={retrying} className="mt-1">
          <RotateCw className={cn('size-4', retrying && 'animate-spin')} aria-hidden="true" />
          {retrying ? 'Tentando…' : 'Tentar novamente'}
        </Button>
      )}
    </div>
  )
}

export function EmptyState({ title, message, action, className }: { title: string; message?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-3 rounded-lg border border-border bg-card px-6 py-10 text-center', className)}>
      <p className="font-semibold">{title}</p>
      {message && <p className="max-w-md text-sm text-muted-foreground">{message}</p>}
      {action}
    </div>
  )
}
