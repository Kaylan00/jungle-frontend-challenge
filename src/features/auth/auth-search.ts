import { z } from 'zod'

/** `redirect` só aceita caminhos internos (evita redirecionamento aberto para outro site). */
export const authSearchSchema = z.object({
  redirect: z
    .string()
    .refine((v) => v.startsWith('/') && !v.startsWith('//'), 'redirect inválido')
    .optional()
    .catch(undefined),
  reason: z.enum(['expired']).optional().catch(undefined),
})
export type AuthSearch = z.infer<typeof authSearchSchema>
