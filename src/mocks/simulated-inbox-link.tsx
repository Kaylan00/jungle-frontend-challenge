/**
 * Atalho da demonstração para o e-mail de redefinição de senha (só existe com VITE_ENABLE_MOCKS=true).
 *
 * Não há servidor de e-mail: o handler de POST /auth/password-reset guarda a mensagem na caixa de
 * saída do servidor simulado (db.outbox). Este componente só lê essa caixa, como o painel de
 * cenários lê o cenário; a resposta da API continua neutra e não traz o link.
 */
import { Link } from '@tanstack/react-router'
import { FlaskConical } from 'lucide-react'
import { useState } from 'react'
import { mockControls } from './controls'

export default function SimulatedInboxLink({ email }: { email: string }) {
  const [message] = useState(() => mockControls.lastEmail(email))
  const token = message ? new URL(message.link).searchParams.get('token') : null

  return (
    <aside
      aria-label="E-mail simulado (demonstração)"
      data-testid="simulated-inbox"
      className="rounded-[4px] border border-dashed border-[#8a4b38] bg-[#170e0b] px-4 py-3 text-[12px] leading-5 text-[#cfb28c] max-md:rounded-[10px]"
    >
      <p className="flex items-center gap-1.5 font-bold text-[#e89b55]">
        <FlaskConical className="size-4" aria-hidden="true" />
        Simulação: nenhum e-mail de verdade foi enviado
      </p>
      <p className="mt-1">
        Sem servidor de e-mail na demonstração: a mensagem fica guardada no servidor simulado (
        <code className="text-foreground">__jungleMock.lastEmail()</code>).
      </p>
      {message && token ? (
        <Link
          to="/redefinir-senha"
          search={{ token }}
          title={message.subject}
          className="mt-2 inline-block font-bold text-[#e89b55] underline underline-offset-4 hover:text-[#f0b07a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Abrir e-mail simulado
        </Link>
      ) : (
        <p className="mt-2">
          Nenhum e-mail foi gerado: não há conta com esse endereço. A resposta da API é a mesma de propósito, para não revelar quem está cadastrado.
        </p>
      )}
    </aside>
  )
}
