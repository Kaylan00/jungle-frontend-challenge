import { z } from 'zod'

/** `redirect` só aceita caminhos internos (evita redirecionamento aberto para outro site). */
export const authSearchSchema = z.object({
  redirect: z
    .string()
    .refine((v) => v.startsWith('/') && !v.startsWith('//'), 'redirect inválido')
    .optional()
    .catch(undefined),
  /** expired: sessão expirou · password-reset: senha acabou de ser redefinida */
  reason: z.enum(['expired', 'password-reset']).optional().catch(undefined),
})
export type AuthSearch = z.infer<typeof authSearchSchema>

const PRIVATE_PREFIXES = ['/pagamento', '/perfil', '/pedido']

/**
 * Para onde o X das telas de conta leva: a página de origem, exceto se ela exigir login (o guard
 * mandaria de volta para o login e o X pareceria não funcionar). Nesse caso, o início.
 */
export function closeTarget(redirect: string | undefined) {
  const isPrivate = !!redirect && PRIVATE_PREFIXES.some((p) => redirect.startsWith(p))
  return redirect && !isPrivate ? redirect : '/'
}

/** /redefinir-senha?token=... (o token vem do link do e-mail) */
export const resetSearchSchema = z.object({
  token: z.string().min(1).max(200).optional().catch(undefined),
})
export type ResetSearch = z.infer<typeof resetSearchSchema>
