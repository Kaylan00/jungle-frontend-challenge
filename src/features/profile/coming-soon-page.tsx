/**
 * Seções do menu "Meu perfil" que estão fora do escopo do desafio (Atividade, Ofertas, Arquivos baixados,
 * Suporte). O item do menu leva a esta tela simples, dentro do layout do perfil, que diz com clareza que a
 * seção ainda não existe: nada aqui finge funcionar.
 */
import { Link } from '@tanstack/react-router'
import { Clock3 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ProfileLayout } from './profile-layout'
import { SOON_SECTIONS, type SoonSection } from './soon-sections'

export function ComingSoonPage({ section }: { section: SoonSection }) {
  const { label, text } = SOON_SECTIONS[section]
  return (
    <ProfileLayout title={label}>
      <h2 className="mb-5 text-[14px] font-bold">{label}</h2>
      <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card px-6 py-12 text-center" data-testid="coming-soon">
        <span aria-hidden="true" className="grid size-11 place-items-center rounded-full border border-[#3f2319] bg-[#2f1d15] text-highlight">
          <Clock3 className="size-5" strokeWidth={1.75} />
        </span>
        <p className="text-[16px] font-bold">Em breve</p>
        <p className="max-w-md text-[14px] leading-6 text-muted-foreground">
          {text} Esta seção ainda não está disponível nesta versão da Kurio.
        </p>
        <Link to="/perfil" className={cn(buttonVariants({ variant: 'outline' }), 'mt-2')}>
          Voltar para Dados do perfil
        </Link>
      </div>
    </ProfileLayout>
  )
}
