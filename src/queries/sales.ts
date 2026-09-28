import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api } from '../lib/api.ts'
import { queryKeys } from '../lib/query-keys.ts'
import { alwaysFresh } from './fresh.ts'
import type { PaginatedResponse, PaymentMethod, Sale } from '../types/index.ts'

export interface SalesListParams {
  q?: string
  limit?: number
}

/**
 * Every cache that a sale change (checkout, void, refund) can make stale:
 * product stock, sale lists/details, stock movements and the sales/low-stock/
 * shift reports. Promos are included because a checkout consumes promo usage.
 */
export function invalidateAfterSaleChange(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: queryKeys.products.all })
  queryClient.invalidateQueries({ queryKey: queryKeys.sales.all })
  queryClient.invalidateQueries({ queryKey: queryKeys.stock.movements({}) })
  // Every report (sales, products, categories, cashiers, profit, shifts, low
  // stock) derives from sales — a single prefix invalidation covers them all.
  queryClient.invalidateQueries({ queryKey: queryKeys.reports.all })
  queryClient.invalidateQueries({ queryKey: queryKeys.promos.all })
}

/** GET /sales */
export function useSales(params: SalesListParams = {}) {
  const { q, limit } = params
  return useQuery({
    queryKey: queryKeys.sales.list({ q, limit }),
    queryFn: () => {
      const search = new URLSearchParams()
      if (q) search.set('q', q)
      if (limit != null) search.set('limit', String(limit))
      const qs = search.toString()
      return api.get<PaginatedResponse<Sale>>(`/sales${qs ? `?${qs}` : ''}`)
    },
    ...alwaysFresh,
  })
}

/** GET /sales/:id */
export function useSale(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.sales.detail(id!),
    queryFn: () => api.get<Sale>(`/sales/${id}`),
    enabled: !!id,
  })
}

export interface CheckoutPayload {
  items: { productId: string; qty: number; discount: number }[]
  payments: { method: PaymentMethod; amount: number; referenceNo?: string }[]
  discount: number
  promoCode?: string
}

/** POST /sales */
export function useCheckoutSale() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CheckoutPayload) => api.post<Sale>('/sales', payload),
    onSuccess: () => invalidateAfterSaleChange(queryClient),
  })
}

/** POST /sales/:id/void */
export function useVoidSale(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.post(`/sales/${id}/void`),
    onSuccess: () => invalidateAfterSaleChange(queryClient),
  })
}

export interface RefundPayload {
  reason: string
  items: { saleItemId: string; qty: number }[]
}

/** POST /sales/:id/refund */
export function useRefundSale(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: RefundPayload) => api.post(`/sales/${id}/refund`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sales.detail(id) })
      invalidateAfterSaleChange(queryClient)
    },
  })
}
