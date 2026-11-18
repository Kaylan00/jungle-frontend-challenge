import { useQueryErrorResetBoundary } from '@tanstack/react-query'
import { useRouter, type ErrorComponentProps } from '@tanstack/react-router'
import { useEffect } from 'react'
import { ErrorState } from '@/components/shared/error-state'
import { toApiError } from '@/api/http'
import { usePageTitle } from '@/lib/page-title'

/** Erro inesperado numa rota: mensagem + "Tentar novamente" que refaz loader e consultas. */
export function RouteError({ error }: ErrorComponentProps) {
  const router = useRouter()
  const { reset } = useQueryErrorResetBoundary()
  useEffect(() => reset(), [reset])
  usePageTitle('Erro ao carregar a página')
  const apiError = toApiError(error)
  return (
    <div className="container-page py-16">
      <ErrorState
        title="Não foi possível carregar esta página"
        message={apiError.message}
        onRetry={() => {
          reset()
          void router.invalidate()
        }}
      />
    </div>
  )
}
