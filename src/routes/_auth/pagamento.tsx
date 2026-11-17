import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_auth/pagamento')({
  component: () => <div className="container-page py-10"><h1 className="text-2xl font-bold">Pagamento</h1></div>,
})
