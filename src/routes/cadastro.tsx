import { createFileRoute } from '@tanstack/react-router'
import { AuthScreen } from '@/features/auth/auth-screen'
import { authSearchSchema } from '@/features/auth/auth-search'

export const Route = createFileRoute('/cadastro')({
  validateSearch: authSearchSchema,
  component: () => <AuthScreen mode="signup" search={Route.useSearch()} />,
})
