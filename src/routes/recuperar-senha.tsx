import { createFileRoute } from '@tanstack/react-router'
import { authSearchSchema } from '@/features/auth/auth-search'
import { ForgotPasswordScreen } from '@/features/auth/forgot-password-screen'

export const Route = createFileRoute('/recuperar-senha')({
  validateSearch: authSearchSchema,
  component: RecuperarSenhaRoute,
})

function RecuperarSenhaRoute() {
  return <ForgotPasswordScreen search={Route.useSearch()} />
}
