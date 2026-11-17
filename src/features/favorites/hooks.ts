/**
 * Favoritos com ATUALIZAÇÃO OTIMISTA e rollback (requisito do desafio).
 *
 * onMutate: cancela buscas em andamento, guarda o estado anterior e já mostra o coração
 *           marcado/desmarcado (resposta instantânea).
 * onError:  devolve o estado guardado (rollback) e avisa o usuário.
 * onSettled: confere com a API (invalidate) para terminar igual ao servidor.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { FavoritesResponse } from '@/api/contracts'
import { api } from '@/api/endpoints'
import { ApiError } from '@/api/http'
import { favoritesQuery, qk } from '@/api/queries'
import { useSession } from '@/features/auth/use-session'
import { announce } from '@/lib/announcer'

export function useFavorites() {
  const { user } = useSession()
  return useQuery({ ...favoritesQuery(user?.id ?? 'guest'), enabled: Boolean(user) })
}

export function useToggleFavorite() {
  const queryClient = useQueryClient()
  const { user } = useSession()
  const key = qk.favorites(user?.id ?? 'guest')

  return useMutation({
    mutationFn: ({ nftId, value }: { nftId: string; value: boolean; name: string }) => (value ? api.addFavorite(nftId) : api.removeFavorite(nftId)),
    onMutate: async ({ nftId, value }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<FavoritesResponse>(key)
      queryClient.setQueryData<FavoritesResponse>(key, (old) => {
        const ids = new Set(old?.nftIds ?? [])
        if (value) ids.add(nftId)
        else ids.delete(nftId)
        return { nftIds: [...ids] }
      })
      return { previous }
    },
    onError: (error, { name, value }, ctx) => {
      queryClient.setQueryData(key, ctx?.previous)
      const msg = `Não foi possível ${value ? 'favoritar' : 'remover dos favoritos'} ${name}. ${error instanceof ApiError ? error.message : ''}`.trim()
      toast.error(msg)
      announce(msg, 'assertive')
    },
    onSuccess: (_data, { name, value }) => {
      announce(value ? `${name} adicionado aos favoritos` : `${name} removido dos favoritos`)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  })
}
