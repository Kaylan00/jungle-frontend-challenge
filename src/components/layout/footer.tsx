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
    <span className="cursor-not-allowed text-foreground/70" title="Em breve">
      {children}
    </span>
  )
}

export function Footer() {
  const [newsletterMsg, setNewsletterMsg] = useState('')
  return (
    <footer className="mt-20 hidden md:block">
      <div className="container-page">
        <div className="grid grid-cols-[1fr_1fr_1fr_1.3fr] gap-0 rounded-t-lg bg-card px-6 py-8">
          {features.map((f) => (
            <div key={f.letter} className="border-r border-primary/40 px-5 first:pl-2">
              <span aria-hidden="true" className="mb-4 grid size-12 place-items-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
                {f.letter}
              </span>
              <h2 className="mb-2 font-bold">{f.title}</h2>
              <p className="text-[13px] leading-relaxed text-muted-foreground">{f.text}</p>
            </div>
          ))}
          <div className="pl-5">
            <h2 className="mb-3 font-bold leading-tight">Antecipe-se ao próximo lançamento</h2>
            <form
              className="flex"
              onSubmit={(e) => {
                e.preventDefault()
                setNewsletterMsg('A inscrição na newsletter não faz parte desta demonstração.')
              }}
            >
              <label htmlFor="newsletter" className="sr-only">
                E-mail para a newsletter
              </label>
              <input id="newsletter" type="email" placeholder="digite seu e-mail..." className="h-9 min-w-0 flex-1 rounded-l-md bg-secondary px-3 text-sm" />
              <button className="rounded-r-md bg-primary px-3 text-sm font-bold text-primary-foreground hover:bg-primary-hover">Enviar</button>
            </form>
            <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground" aria-live="polite">
              {newsletterMsg || 'Receba lançamentos selecionados, histórias de criadores e novidades do mercado.'}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-4 items-center gap-4 bg-band px-6 py-4 text-sm">
          <span className="font-bold tracking-[0.12em]">KURIO</span>
          <span>Feito para colecionadores, criadores e cultura</span>
          <span>contato@kurio.test</span>
          <span>+55 11 4002 8922</span>
        </div>
        <div className="grid grid-cols-4 gap-4 rounded-b-lg bg-card px-6 py-8 text-sm">
          <div>
            <h2 className="mb-3 font-bold">Meu perfil</h2>
            <ul className="space-y-2">
              <li><Link to="/perfil" className="hover:text-primary">Meu perfil</Link></li>
              <li><Link to="/perfil/carteiras" className="hover:text-primary">Carteiras</Link></li>
              <li><Link to="/perfil/favoritos" className="hover:text-primary">Lista de interesse</Link></li>
              <li><Soon>Atividade</Soon></li>
            </ul>
          </div>
          <div>
            <h2 className="mb-3 font-bold">Central de ajuda</h2>
            <ul className="space-y-2">
              <li><Soon>Central de ajuda</Soon></li>
              <li><Soon>Como comprar NFTs</Soon></li>
              <li><Soon>Carteira e segurança</Soon></li>
              <li><Soon>Política do mercado</Soon></li>
            </ul>
          </div>
          <div>
            <h2 className="mb-3 font-bold">Coleções</h2>
            <ul className="space-y-2">
              <li><Link to="/" search={{ category: ['arte-digital'] }} hash="catalogo" className="hover:text-primary">Arte digital</Link></li>
              <li><Link to="/" search={{ category: ['fotografia'] }} hash="catalogo" className="hover:text-primary">Fotografia</Link></li>
              <li><Link to="/" search={{ category: ['musica'] }} hash="catalogo" className="hover:text-primary">Música</Link></li>
              <li><Link to="/" search={{ category: ['arte-3d'] }} hash="catalogo" className="hover:text-primary">Arte 3D</Link></li>
            </ul>
          </div>
          <div>
            <h2 className="mb-3 font-bold">Carteiras compatíveis</h2>
            <p className="inline-block rounded bg-band px-3 py-1 text-[11px] font-semibold tracking-wide text-primary">METAMASK · WALLETCONNECT · COINBASE</p>
          </div>
        </div>
        <p className="py-6 text-center text-xs text-muted-foreground">© 2026 Kurio. Propriedade digital para todos. Dados simulados para demonstração.</p>
      </div>
    </footer>
  )
}
