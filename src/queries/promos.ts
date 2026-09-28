import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api } from '../lib/api.ts'
import { queryKeys } from '../lib/query-keys.ts'
import type { Promo, ValidatedPromo } from '../types/index.ts'

export interface PromoInput {
  code: string
  name: string
  type: Promo['type']
  value: number
  minPurchase: number
  maxDiscount: number | null
  startsAt: string
  endsAt: string | null
  usageLimit: number | null
}

/** Promo writes change which promos the cashier can apply. */
export function invalidateAfterPromoChange(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: queryKeys.promos.all })
}

/** GET /promos */
export function usePromos() {
  return useQuery({
    queryKey: queryKeys.promos.list(),
    queryFn: () => api.get<Promo[]>('/promos'),
  })
}

/** POST /promos or PATCH /promos/:id */
export function useSavePromo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: PromoInput & { id?: string }) =>
      id ? api.patch(`/promos/${id}`, body) : api.post('/promos', body),
    onSuccess: () => invalidateAfterPromoChange(queryClient),
  })
}

/** PATCH /promos/:id — flip isActive */
export function useTogglePromo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (promo: Promo) => api.patch(`/promos/${promo.id}`, { isActive: !promo.isActive }),
    onSuccess: () => invalidateAfterPromoChange(queryClient),
  })
}

/** GET /promos/validate — cashier applies a code to the current cart total */
export function useValidatePromo() {
  return useMutation({
    mutationFn: ({ code, subtotal }: { code: string; subtotal: number }) =>
      api.get<ValidatedPromo>(`/promos/validate?code=${encodeURIComponent(code)}&subtotal=${subtotal}`),
  })
}
