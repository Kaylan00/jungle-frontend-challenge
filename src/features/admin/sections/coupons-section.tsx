import { AdminCoupons } from '../admin-coupons'
import { useAdminCoupons } from '../hooks'
import { PanelPage } from '../shell/panel-page'
import { sectionMeta } from '../shell/sections'
import { SkLines } from './ui'

const META = sectionMeta('/admin/cupons')

/**
 * Cupons: criar, acompanhar o status (ativo, expirado, desativado) e desativar.
 * A frase do cabeçalho traz quantos estão ativos; enquanto a lista carrega, a forma longa dela aparece em
 * skeleton (mesmas linhas), para o cabeçalho não mudar de altura quando o número chega.
 */
export function CouponsSection({ highlight }: { highlight?: string }) {
  const query = useAdminCoupons()
  const active = query.data?.items.filter((c) => c.status === 'active').length
  return (
    <PanelPage
      eyebrow={META.eyebrow}
      title={META.label}
      description={
        active === undefined ? (
          query.isError ? (
            'Descontos que valem no carrinho e no pagamento assim que são criados.'
          ) : (
            <SkLines>{META.intro}</SkLines>
          )
        ) : (
          `${active} ${active === 1 ? 'cupom ativo' : 'cupons ativos'}. Valem no carrinho e no pagamento assim que são criados; desativar tira o desconto de quem já aplicou.`
        )
      }
    >
      <AdminCoupons query={query} highlight={highlight} />
    </PanelPage>
  )
}
