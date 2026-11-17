import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_auth/perfil/')({
  component: () => <div className="container-page py-10"><h1 className="text-2xl font-bold">Perfil</h1></div>,
})
