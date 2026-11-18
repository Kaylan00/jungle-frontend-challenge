import { createFileRoute } from '@tanstack/react-router'
import { resetSearchSchema } from '@/features/auth/auth-search'
import { ResetPasswordScreen } from '@/features/auth/reset-password-screen'

export const Route = createFileRoute('/redefinir-senha')({
  validateSearch: resetSearchSchema,
  component: RedefinirSenhaRoute,
})

function RedefinirSenhaRoute() {
  return <ResetPasswordScreen token={Route.useSearch().token} />
}
