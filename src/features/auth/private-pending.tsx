/**
 * O que aparece enquanto uma rota privada confere a sessão na API (beforeLoad de /_auth). Antes era uma tela
 * vazia (nem o cabeçalho aparecia); agora a página pedida já aparece no lugar, com o skeleton que ela mesma
 * usa enquanto os dados chegam. As telas "Em breve" do perfil não dependem de dado nenhum: aparecem prontas.
 */
import { useRouterState } from '@tanstack/react-router'
import { CheckoutPending } from '@/features/checkout/checkout-page'
import { OrderPending } from '@/features/checkout/order-page'
import { ActivityPending } from '@/features/profile/activity-page'
import { ComingSoonPage } from '@/features/profile/coming-soon-page'
import { FavoritesPending } from '@/features/profile/favorites-page'
import { ProfilePending } from '@/features/profile/profile-page'
import { isSoonSection } from '@/features/profile/soon-sections'
import { WalletsPending } from '@/features/profile/wallets-page'

export function PrivatePagePending() {
  const pathname = useRouterState({ select: (s) => s.location.pathname.replace(/\/$/, '') || '/' })
  if (pathname === '/perfil') return <ProfilePending />
  if (pathname === '/perfil/carteiras') return <WalletsPending />
  if (pathname === '/perfil/favoritos') return <FavoritesPending />
  if (pathname === '/perfil/atividade') return <ActivityPending />
  const soon = pathname.match(/^\/perfil\/([^/]+)$/)?.[1]
  if (soon && isSoonSection(soon)) return <ComingSoonPage section={soon} />
  if (pathname === '/pagamento') return <CheckoutPending />
  if (pathname.startsWith('/pedido/')) return <OrderPending />
  return null
}
