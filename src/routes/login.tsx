import { createFileRoute } from '@tanstack/react-router'
import { AuthScreen } from '@/features/auth/auth-screen'
import { authSearchSchema } from '@/features/auth/auth-search'

export const Route = createFileRoute('/login')({
  validateSearch: authSearchSchema,
  component: () => <AuthScreen mode="login" search={Route.useSearch()} />,
})
