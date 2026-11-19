import { createFileRoute } from '@tanstack/react-router'
import { ActivityPage } from '@/features/profile/activity-page'

/** Histórico de compras da conta (antes de /perfil/$secao, que trata as seções ainda fora do escopo). */
export const Route = createFileRoute('/_auth/perfil/atividade')({
  component: ActivityPage,
})
