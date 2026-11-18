import { AdminCoupons } from '../admin-coupons'
import { useAdminCoupons } from '../hooks'
import { PanelPage } from '../shell/panel-page'

/** Cupons: criar, acompanhar o status (ativo, expirado, desativado) e desativar. */
export function CouponsSection({ highlight }: { highlight?: string }) {
  const query = useAdminCoupons()
  const active = query.data?.items.filter((c) => c.status === 'active').length
  return (
    <PanelPage
      eyebrow="Vendas"
      title="Cupons"
      description={
        active === undefined
          ? 'Descontos que valem no carrinho e no pagamento assim que são criados.'
          : `${active} ${active === 1 ? 'cupom ativo' : 'cupons ativos'}. Valem no carrinho e no pagamento assim que são criados; desativar tira o desconto de quem já aplicou.`
      }
    >
      <AdminCoupons query={query} highlight={highlight} />
    </PanelPage>
  )
}
