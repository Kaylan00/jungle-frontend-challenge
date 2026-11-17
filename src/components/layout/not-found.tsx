import { Link } from '@tanstack/react-router'
import { buttonVariants } from '@/components/ui/button'

export function NotFound({ title = 'Página não encontrada', description = 'O endereço que você abriu não existe ou foi removido.' }: { title?: string; description?: string }) {
  return (
    <section className="container-page flex min-h-[50vh] flex-col items-center justify-center gap-4 py-16 text-center" aria-labelledby="nf-title">
      <p className="text-sm font-semibold text-primary">Erro 404</p>
      <h1 id="nf-title" className="text-2xl font-bold uppercase md:text-3xl">
        {title}
      </h1>
      <p className="max-w-md text-muted-foreground">{description}</p>
      <Link to="/" className={buttonVariants()}>
        Voltar para o início
      </Link>
    </section>
  )
}
