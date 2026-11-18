import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'

/**
 * Aplica no react-hook-form os erros por campo devolvidos pela API (ex.: e-mail já cadastrado).
 * Só os campos de `allowed` (os que existem no formulário); o primeiro recebe o foco.
 * Devolve true se algum erro foi aplicado.
 */
export function applyApiFieldErrors<T extends FieldValues>(fields: Record<string, string>, setError: UseFormSetError<T>, allowed: ReadonlyArray<Path<T>>) {
  let first = true
  for (const [name, message] of Object.entries(fields)) {
    if (!allowed.includes(name as Path<T>)) continue
    setError(name as Path<T>, { type: 'server', message }, { shouldFocus: first })
    first = false
  }
  return !first
}
