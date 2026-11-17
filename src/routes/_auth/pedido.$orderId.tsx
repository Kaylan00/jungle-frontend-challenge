import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_auth/pedido/$orderId')({
  component: () => <div className="container-page py-10"><h1 className="text-2xl font-bold">Pedido</h1></div>,
})
