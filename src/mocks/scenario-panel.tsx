/**
 * Painel de cenários (só existe com VITE_ENABLE_MOCKS=true).
 * É uma ferramenta de demonstração: muda o "servidor" simulado (latência, falhas, pagamento,
 * eventos). A interface do app continua recebendo tudo por REST e Socket.IO.
 */
import { FlaskConical, X } from 'lucide-react'
import { useState, useSyncExternalStore } from 'react'
import { mockControls } from './controls'
import { PRESETS, subscribeScenario, type Scenario } from './scenario'

const PRESET_LABEL: Record<string, string> = {
  padrao: 'Padrão',
  rapido: 'Sem latência',
  lento: 'Rede lenta (2,5 s)',
  'latencia-variavel': 'Latência variável',
  'fora-de-ordem': 'Respostas fora de ordem',
  'catalogo-500': 'Catálogo com erro 500',
  'sem-conexao': 'Sem conexão (todas as rotas)',
  'pagamento-recusado': 'Pagamento recusado',
  'timeout-pedido': 'Timeout ao criar pedido',
  'carteira-recusa': 'Carteira recusa conexão',
  'sessao-curta': 'Sessão de 60 s',
  'tempo-real-offline': 'Socket.IO fora do ar',
  'eventos-caoticos': 'Eventos duplicados e antigos',
}

export default function ScenarioPanel() {
  const [open, setOpen] = useState(false)
  // Loja externa: o React se inscreve e confere o valor atual no mesmo passo, então uma mudança feita enquanto
  // o painel ainda montava (teste, outra aba, ?mock=) nunca fica de fora.
  const scenario: Scenario = useSyncExternalStore(subscribeScenario, mockControls.getScenario)
  const [log, setLog] = useState('')

  const act = (msg: string, fn: () => unknown) => {
    fn()
    setLog(msg)
  }

  // Fechado: aba pequena encostada na borda esquerda, a meia altura, só com o ícone. Fica na margem da página
  // (nenhuma tela tem conteúdo nos primeiros 24px) e longe das barras fixas do rodapé e do resumo do carrinho.
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed left-0 top-1/2 z-50 grid h-11 w-6 -translate-y-1/2 place-items-center rounded-r-md border border-l-0 border-border bg-card/85 text-primary opacity-80 shadow-md backdrop-blur-sm transition-[opacity,width] motion-reduce:transition-none hover:w-7 hover:opacity-100 focus-visible:w-7 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Abrir painel de cenários da simulação"
        title="Cenários da simulação"
      >
        <FlaskConical className="size-3.5" aria-hidden="true" />
      </button>
    )
  }

  return (
    <div className="fixed bottom-[116px] left-3 z-50 md:bottom-4">
      <section
        aria-label="Painel de cenários da simulação"
        className="w-[300px] max-w-[calc(100vw-24px)] rounded-lg border border-border bg-card p-4 text-[12px] shadow-2xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">Cenários da simulação</h2>
          <button type="button" aria-label="Fechar painel de cenários" onClick={() => setOpen(false)} className="rounded p-1 hover:bg-secondary">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <label htmlFor="mock-preset" className="mb-1 block text-muted-foreground">
          Condição de rede / negócio
        </label>
        <select
          id="mock-preset"
          className="mb-3 h-8 w-full rounded border border-border bg-secondary px-2"
          onChange={(e) => {
            // Cada preset parte do cenário base inteiro (o "Padrão" zera falhas, pagamento, socket etc.).
            mockControls.applyPreset(e.target.value)
            setLog(`Cenário: ${PRESET_LABEL[e.target.value]}`)
          }}
          defaultValue=""
        >
          <option value="" disabled>
            Escolher…
          </option>
          {Object.keys(PRESETS).map((k) => (
            <option key={k} value={k}>
              {PRESET_LABEL[k] ?? k}
            </option>
          ))}
        </select>

        <dl className="mb-3 grid grid-cols-2 gap-x-2 gap-y-1 text-muted-foreground">
          <dt>Latência</dt>
          <dd className="text-foreground">{scenario.latency}</dd>
          <dt>Pagamento</dt>
          <dd className="text-foreground">{scenario.payment === 'approve' ? 'aprova' : 'recusa'}</dd>
          <dt>Falhas ativas</dt>
          <dd className="text-foreground">{scenario.faults.length}</dd>
          <dt>Socket.IO</dt>
          <dd className="text-foreground">{scenario.realtimeOffline ? 'fora do ar' : 'no ar'}</dd>
        </dl>

        <p className="mb-1 font-semibold">Eventos em tempo real</p>
        <div className="mb-3 grid grid-cols-2 gap-1.5">
          <PanelButton onClick={() => act('Preço do Emerald Ape #042 (1/50) alterado para 1.35 ETH', () => mockControls.changePrice('nft-01', 'nft-01-ed-3', '1.35'))}>Mudar preço</PanelButton>
          <PanelButton onClick={() => act('Edição 1/50 do Emerald Ape #042 esgotada', () => mockControls.setAvailability('nft-01', 'nft-01-ed-3', 0))}>Esgotar edição</PanelButton>
          <PanelButton onClick={() => act('Último evento reenviado (duplicata)', () => mockControls.reemitLastEvent())}>Duplicar evento</PanelButton>
          <PanelButton onClick={() => act('Evento antigo enviado para o Emerald Ape #042', () => mockControls.emitStaleNftEvent('nft-01'))}>Evento antigo</PanelButton>
          <PanelButton onClick={() => act('Conexões derrubadas: o cliente vai reconectar', () => mockControls.dropConnections())}>Derrubar socket</PanelButton>
          <PanelButton onClick={() => act(scenario.realtimeOffline ? 'Socket.IO no ar' : 'Socket.IO fora do ar', () => mockControls.setRealtimeOffline(!scenario.realtimeOffline))}>
            {scenario.realtimeOffline ? 'Ligar socket' : 'Desligar socket'}
          </PanelButton>
        </div>

        <p className="mb-1 font-semibold">Sessão e dados</p>
        <div className="grid grid-cols-2 gap-1.5">
          <PanelButton onClick={() => act('Sessões expiradas no servidor', () => mockControls.expireSessions())}>Expirar sessão</PanelButton>
          <PanelButton
            onClick={() =>
              act('Dados e cenário restaurados. Recarregando…', async () => {
                await mockControls.reset()
                localStorage.removeItem('jungle.session.token')
                localStorage.removeItem('jungle.cart.guest')
                window.location.assign('/')
              })
            }
          >
            Resetar tudo
          </PanelButton>
        </div>
        <p className="mt-3 min-h-4 text-primary" aria-live="polite">
          {log}
        </p>
      </section>
    </div>
  )
}

function PanelButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded border border-border bg-secondary px-2 py-1.5 text-left hover:border-primary">
      {children}
    </button>
  )
}
