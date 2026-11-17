import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/nft/$nftId')({
  component: () => <div className="container-page py-10"><h1 className="text-2xl font-bold">Detalhe do NFT</h1></div>,
})
