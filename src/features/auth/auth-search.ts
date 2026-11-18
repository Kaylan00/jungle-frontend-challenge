import { z } from 'zod'

const SAME_ORIGIN_PROBE = 'https://kurio.invalid'

/**
 * Caminho interno do app (evita redirecionamento aberto). Além de "começa com uma barra e não com duas",
 * recusa o que o navegador transformaria em outro host: "/\evil.com" (a barra invertida vira barra) e
 * tab/quebra de linha no meio ("/\t/evil.com", que o parser de URL remove). A palavra final é do parser.
 */
export function isInternalPath(value: string) {
  if (!value.startsWith('/') || value.startsWith('//') || /[\\\p{Cc}]/u.test(value)) return false
  try {
    return new URL(value, SAME_ORIGIN_PROBE).origin === SAME_ORIGIN_PROBE
  } catch {
    return false
  }
}

/** `redirect` só aceita caminhos internos (evita redirecionamento aberto para outro site). */
export const authSearchSchema = z.object({
  redirect: z
    .string()
    .max(2048)
    .refine(isInternalPath, 'redirect inválido')
    .optional()
    .catch(undefined),
  /** expired: sessão expirou · password-reset: senha acabou de ser redefinida */
  reason: z.enum(['expired', 'password-reset']).optional().catch(undefined),
})
export type AuthSearch = z.infer<typeof authSearchSchema>

const PRIVATE_PREFIXES = ['/pagamento', '/perfil', '/pedido', '/admin']

/** Página que exige login (layout `_auth`). */
export const isPrivatePath = (path: string) => PRIVATE_PREFIXES.some((p) => path.startsWith(p))

/**
 * Para onde o X das telas de conta leva: a página de origem, exceto se ela exigir login (o guard
 * mandaria de volta para o login e o X pareceria não funcionar). Nesse caso, o início.
 */
export function closeTarget(redirect: string | undefined) {
  return redirect && !isPrivatePath(redirect) ? redirect : '/'
}

/** /redefinir-senha?token=... (o token vem do link do e-mail) */
export const resetSearchSchema = z.object({
  token: z.string().min(1).max(200).optional().catch(undefined),
})
export type ResetSearch = z.infer<typeof resetSearchSchema>
