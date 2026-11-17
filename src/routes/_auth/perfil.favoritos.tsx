import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_auth/perfil/favoritos')({
  component: () => <div className="container-page py-10"><h1 className="text-2xl font-bold">Favoritos</h1></div>,
})
