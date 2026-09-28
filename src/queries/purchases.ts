import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api } from '../lib/api.ts'
import { queryKeys } from '../lib/query-keys.ts'
import type { PaginatedResponse, Product, Purchase } from '../types/index.ts'

export interface PurchaseInput {
  supplierId: string | null
  notes: string | null
  items: { productId: string; qty: number; costPrice: number }[]
}

/**
 * Receiving a purchase restocks products and writes stock movements, so the
 * purchase list, product lists, movements and the low-stock report all go stale.
 */
export function invalidateAfterPurchaseChange(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: queryKeys.purchases.list() })
  queryClient.invalidateQueries({ queryKey: queryKeys.products.all })
  queryClient.invalidateQueries({ queryKey: queryKeys.stock.movements({}) })
  queryClient.invalidateQueries({ queryKey: queryKeys.reports.lowStock() })
}

/** GET /purchases */
export function usePurchases() {
  return useQuery({
    queryKey: queryKeys.purchases.list(),
    queryFn: () => api.get<Purchase[]>('/purchases'),
  })
}

/** GET /products?active=true&limit=100 — the purchase form's product picker */
export function usePurchaseProductOptions(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.products.list({ active: true, limit: 100 }),
    queryFn: () => api.get<PaginatedResponse<Product>>('/products?active=true&limit=100'),
    enabled: options?.enabled ?? true,
  })
}

/** POST /purchases */
export function useCreatePurchase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: PurchaseInput) => api.post('/purchases', body),
    onSuccess: () => invalidateAfterPurchaseChange(queryClient),
  })
}
