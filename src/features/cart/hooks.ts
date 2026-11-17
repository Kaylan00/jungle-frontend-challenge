import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { toast } from 'sonner'
import type { AddToCartInput, Cart } from '@/api/contracts'
import { api } from '@/api/endpoints'
import { ApiError } from '@/api/http'
import { cartQuery, qk } from '@/api/queries'
import { sessionStore } from '@/api/session-store'
import { useSession } from '@/features/auth/use-session'
import { announce } from '@/lib/announcer'

export function useCart() {
  const { owner, isLoading } = useSession()
  const query = useQuery({ ...cartQuery(owner), enabled: !isLoading })
  // Visitante: guarda o id do carrinho criado pela API para recuperar após refresh e juntar no login.
  useEffect(() => {
    if (owner === 'guest' && query.data?.owner === 'guest') sessionStore.setGuestCartId(query.data.id)
  }, [owner, query.data])
  return query
}

export function useCartCount() {
  const { data } = useCart()
  return data?.items.reduce((s, i) => s + i.quantity, 0) ?? 0
}

/** Toda mutation de carrinho devolve o carrinho inteiro: o cache recebe a resposta da API. */
function useCartMutation<V>(fn: (v: V) => Promise<Cart>, opts: { success?: (v: V, cart: Cart) => string | null } = {}) {
  const queryClient = useQueryClient()
  const { owner } = useSession()
  return useMutation({
    mutationFn: fn,
    onSuccess: (cart, vars) => {
      queryClient.setQueryData(qk.cart(owner), cart)
      const msg = opts.success?.(vars, cart)
      if (msg) {
        toast.success(msg)
        announce(msg)
      }
    },
    onError: (error) => {
      // Conflito de disponibilidade: o cache pode estar velho, busca o carrinho atual.
      if (error instanceof ApiError && error.code === 'AVAILABILITY_CONFLICT') {
        void queryClient.invalidateQueries({ queryKey: qk.cart(owner) })
        void queryClient.invalidateQueries({ queryKey: qk.nfts })
      }
      const msg = error instanceof ApiError ? error.message : 'Não foi possível atualizar o carrinho'
      toast.error(msg)
      announce(msg, 'assertive')
    },
  })
}

export function useAddToCart() {
  return useCartMutation((input: AddToCartInput) => api.addToCart(input), {
    success: (v) => `${v.quantity} ${v.quantity > 1 ? 'itens adicionados' : 'item adicionado'} ao carrinho`,
  })
}

export function useUpdateCartItem() {
  return useCartMutation(({ itemId, quantity }: { itemId: string; quantity: number }) => api.updateCartItem(itemId, quantity), {
    success: (v) => `Quantidade atualizada para ${v.quantity}`,
  })
}

export function useRemoveCartItem() {
  return useCartMutation(({ itemId }: { itemId: string; name: string }) => api.removeCartItem(itemId), {
    success: (v) => `${v.name} removido do carrinho`,
  })
}

export function useApplyCoupon() {
  return useCartMutation((code: string) => api.applyCoupon(code), { success: (code) => `Cupom ${code.toUpperCase()} aplicado` })
}

export function useRemoveCoupon() {
  return useCartMutation(() => api.removeCoupon(), { success: () => 'Cupom removido' })
}

export function useAcknowledgePrices() {
  return useCartMutation(() => api.acknowledgePrices(), { success: () => 'Novos preços confirmados' })
}
