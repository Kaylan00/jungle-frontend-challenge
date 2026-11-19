import { Link } from '@tanstack/react-router'
import { useState } from 'react'

const features = [
  { letter: 'W', title: 'Segurança da carteira', text: 'Proteja sua carteira e colecione arte digital verificada com confiança.' },
  { letter: 'C', title: 'Criadores em destaque', text: 'Conheça artistas, estúdios e comunidades que moldam a cultura digital na rede.' },
  { letter: 'D', title: 'Alertas de lançamentos', text: 'Receba calendários de cunhagem, novidades de listas de acesso e análises do mercado.' },
]

/** Itens fora do escopo aparecem como texto com aviso, nunca como link que "funciona". */
function Soon({ children }: { children: React.ReactNode }) {
  return (
    <span className="cursor-not-allowed" title="Em breve">
      {children}
    </span>
  )
}

const linkClass = 'transition-colors hover:text-highlight'
const colTitle = 'text-lg font-bold leading-[22px]'

/** Ícones das redes (Figma: glifo laranja em quadrado de 32 px com borda laranja). */
const SOCIAL: Array<{ name: string; icon: React.ReactNode }> = [
  {
    name: 'Facebook',
    icon: <path fill="currentColor" d="M13.4 21v-7.6h2.6l.4-3h-3V8.5c0-.9.3-1.5 1.5-1.5h1.6V4.3c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.3H7.8v3h2.6V21z" />,
  },
  {
    name: 'Instagram',
    icon: (
      <g fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="4" y="4" width="16" height="16" rx="4.5" />
        <circle cx="12" cy="12" r="3.6" />
        <circle cx="16.6" cy="7.4" r=".5" fill="currentColor" />
      </g>
    ),
  },
  {
    name: 'Twitter',
    icon: (
      <path
        fill="currentColor"
        d="M21.5 6.6c-.7.3-1.4.5-2.2.6.8-.5 1.4-1.2 1.7-2.1-.7.4-1.6.8-2.4.9a3.9 3.9 0 0 0-6.7 3.5C8.6 9.4 5.7 7.9 3.8 5.5c-.3.6-.5 1.2-.5 2 0 1.3.7 2.5 1.7 3.2-.6 0-1.2-.2-1.8-.5 0 1.9 1.4 3.5 3.1 3.8-.6.2-1.2.2-1.8.1.5 1.5 2 2.7 3.6 2.7A7.8 7.8 0 0 1 2.5 18.4 11 11 0 0 0 8.5 20.2c7.2 0 11.1-6 11.1-11.1v-.5c.8-.5 1.4-1.2 1.9-2z"
      />
    ),
  },
  {
    name: 'LinkedIn',
    icon: (
      <g fill="currentColor">
        <rect x="4.2" y="9.2" width="3.4" height="10.6" />
        <circle cx="5.9" cy="5.9" r="2" />
        <path d="M10 9.2h3.3v1.5c.5-.9 1.6-1.8 3.4-1.8 3.5 0 4.1 2.3 4.1 5.3v5.6h-3.4v-5c0-1.2 0-2.7-1.7-2.7s-1.9 1.3-1.9 2.6v5.1H10z" />
      </g>
    ),
  },
  {
    name: 'YouTube',
    icon: (
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M21.2 7.7a2.4 2.4 0 0 0-1.7-1.7C18 5.6 12 5.6 12 5.6s-6 0-7.5.4A2.4 2.4 0 0 0 2.8 7.7c-.4 1.5-.4 4.3-.4 4.3s0 2.8.4 4.3a2.4 2.4 0 0 0 1.7 1.7c1.5.4 7.5.4 7.5.4s6 0 7.5-.4a2.4 2.4 0 0 0 1.7-1.7c.4-1.5.4-4.3.4-4.3s0-2.8-.4-4.3zM9.4 10h5.2v4H9.4z"
      />
    ),
  },
]

export function Footer() {
  const [newsletterMsg, setNewsletterMsg] = useState('')
  return (
    // Três caixas alinhadas às bordas do conteúdo (mesma margem lateral da página), como no Figma.
    // Colunas em fr com as proporções do Figma (em 1440 dão exatamente as larguras em px dele); em telas
    // largas os recuos crescem junto (wide:), então cada coluna fica no mesmo lugar relativo.
    <footer className="scale-frame mt-20 hidden md:block">
      <div className="container-page">
        {/* Vantagens + newsletter */}
        <div className="grid grid-cols-2 gap-y-8 bg-card px-6 py-8 lg:grid-cols-4 lg:gap-y-0 xl:h-[250px] xl:grid-cols-[266fr_266fr_266fr_341fr] xl:pb-4 xl:pl-[31px] xl:pr-[30px] xl:pt-8 wide:pl-[calc(31*var(--u))] wide:pr-[calc(30*var(--u))]">
          {features.map((f) => (
            <div key={f.letter} className="border-primary pl-[17px] pr-4 lg:border-r xl:pr-0 wide:pl-[calc(17*var(--u))]">
              <span aria-hidden="true" className="grid size-[74px] place-items-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
                {f.letter}
              </span>
              <h2 className="mt-2.5 text-[17px] font-bold leading-[22px]">{f.title}</h2>
              <p className="mt-2 max-w-[200px] leading-[22px] text-muted-foreground wide:max-w-[calc(200*var(--u))]">{f.text}</p>
            </div>
          ))}
          <div className="pl-4 wide:pl-[calc(16*var(--u))]">
            <h2 className="-mt-px text-lg font-bold leading-[18px]">
              Antecipe-se ao próximo
              <br />
              lançamento
            </h2>
            <form
              className="mt-[13px] flex h-10"
              onSubmit={(e) => {
                e.preventDefault()
                setNewsletterMsg('A inscrição na newsletter não faz parte desta demonstração.')
              }}
            >
              <label htmlFor="newsletter" className="sr-only">
                E-mail para a newsletter
              </label>
              <input
                id="newsletter"
                type="email"
                placeholder="digite seu e-mail..."
                className="h-10 min-w-0 flex-1 rounded-l-[4px] bg-band pl-3 pr-2 placeholder:text-[#b19362]"
              />
              <button className="w-[85px] rounded-r-[4px] bg-primary pl-[17px] text-left text-lg font-bold text-primary-foreground transition-colors hover:bg-primary-hover">
                Enviar
              </button>
            </form>
            <p className="mt-[11px] text-[13px] leading-[22px] text-muted-foreground" aria-live="polite">
              {newsletterMsg || 'Receba lançamentos selecionados, histórias de criadores e novidades do mercado.'}
            </p>
          </div>
        </div>

        {/* Faixa de contato */}
        <div className="grid min-h-[88px] grid-cols-2 items-center gap-x-6 gap-y-3 bg-band px-8 py-5 leading-[22px] lg:grid-cols-4 xl:h-[88px] xl:grid-cols-[303fr_303fr_302fr_260fr] xl:gap-0 xl:py-0 xl:pr-0 wide:pl-[calc(32*var(--u))]">
          <span className="text-sm font-bold leading-5 tracking-[0.12em]">KURIO</span>
          <span className="max-w-[230px] wide:max-w-[calc(230*var(--u))]">Feito para colecionadores, criadores e cultura</span>
          <span>contato@email.com</span>
          <span>+55 11 4002 8922</span>
        </div>

        {/* Links */}
        <div className="grid grid-cols-2 gap-y-8 bg-card px-8 pb-8 pt-[29px] leading-[30px] lg:grid-cols-4 xl:h-[236px] xl:grid-cols-[303fr_303fr_302fr_260fr] xl:gap-y-0 xl:pb-0 xl:pr-0 wide:pl-[calc(32*var(--u))]">
          <div>
            <h2 className={colTitle}>Meu perfil</h2>
            <ul className="mt-[5px]">
              <li><Link to="/perfil" className={linkClass}>Meu perfil</Link></li>
              <li><Soon>Minha coleção</Soon></li>
              <li><Link to="/perfil/atividade" className={linkClass}>Atividade</Link></li>
              <li><Soon>Estúdio do criador</Soon></li>
              <li><Link to="/perfil/favoritos" className={linkClass}>Lista de interesse</Link></li>
            </ul>
          </div>
          <div>
            <h2 className={colTitle}>Central de ajuda</h2>
            <ul className="mt-[5px]">
              <li><Soon>Central de ajuda</Soon></li>
              <li><Soon>Como comprar NFTs</Soon></li>
              <li><Soon>Carteira e segurança</Soon></li>
              <li><Soon>Política do mercado</Soon></li>
              <li><Soon>Denunciar item</Soon></li>
            </ul>
          </div>
          <div>
            <h2 className={colTitle}>Coleções</h2>
            <ul className="mt-[5px]">
              <li><Link to="/" search={{ category: ['arte-digital'] }} hash="catalogo" className={linkClass}>Arte digital</Link></li>
              <li><Link to="/" search={{ category: ['fotografia'] }} hash="catalogo" className={linkClass}>Fotografia</Link></li>
              <li><Link to="/" search={{ category: ['musica'] }} hash="catalogo" className={linkClass}>Música</Link></li>
              <li><Link to="/" search={{ category: ['arte-3d'] }} hash="catalogo" className={linkClass}>Arte 3D</Link></li>
              <li><Link to="/" search={{ category: ['utilidade'] }} hash="catalogo" className={linkClass}>Utilidade</Link></li>
            </ul>
          </div>
          <div>
            <h2 className={colTitle}>Redes sociais</h2>
            <ul className="-ml-px mt-4 flex gap-2 leading-none" aria-label="Redes sociais (em breve)">
              {SOCIAL.map((s) => (
                <li key={s.name}>
                  <span className="grid size-8 cursor-not-allowed place-items-center rounded-[4px] border border-primary text-primary" title={`${s.name} (em breve)`}>
                    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                      {s.icon}
                    </svg>
                    <span className="sr-only">{s.name} (em breve)</span>
                  </span>
                </li>
              ))}
            </ul>
            <h2 className={`${colTitle} mt-7`}>Carteiras compatíveis</h2>
            <p className="mt-[9px] inline-flex h-[26px] max-w-full items-center xl:min-w-[228px] whitespace-pre rounded-[4px] border border-primary/40 bg-band px-2.5 text-[9px] font-bold leading-none tracking-[0.1px] text-primary">
              {'METAMASK  •  WALLETCONNECT  •  COINBASE'}
            </p>
          </div>
        </div>
        <p className="pb-[29px] pt-[11px] text-center leading-5">
          © 2026 Kurio. Propriedade digital para todos.
          {/* Porta da equipe: discreta (não compete com a loja) e sem atalho no menu da conta. O painel tem login
              próprio e a API confere o papel em cada chamada; esconder o endereço não seria proteção. */}
          <span aria-hidden="true" className="mx-2 text-subtle-foreground">
            ·
          </span>
          <Link to="/admin" preload={false} className="text-[12px] text-subtle-foreground underline-offset-4 transition-colors hover:text-highlight hover:underline">
            Área da equipe
          </Link>
        </p>
      </div>
    </footer>
  )
}
