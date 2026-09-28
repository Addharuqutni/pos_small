import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api } from '../lib/api.ts'
import { queryKeys } from '../lib/query-keys.ts'
import type { PaginatedResponse, Product, StockMovement } from '../types/index.ts'

/**
 * A manual stock adjustment moves stock and writes a movement, so product
 * lists and the low-stock report go stale along with the movement history.
 */
export function invalidateAfterStockAdjustment(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: queryKeys.stock.movements({}) })
  queryClient.invalidateQueries({ queryKey: queryKeys.products.all })
  queryClient.invalidateQueries({ queryKey: queryKeys.reports.lowStock() })
}

/** GET /stock/movements */
export function useStockMovements(params: { productId?: string } = {}) {
  return useQuery({
    queryKey: queryKeys.stock.movements(params),
    queryFn: () => {
      const search = new URLSearchParams()
      if (params.productId) search.set('productId', params.productId)
      const qs = search.toString()
      return api.get<PaginatedResponse<StockMovement>>(`/stock/movements${qs ? `?${qs}` : ''}`)
    },
  })
}

/** GET /products?active=true — the picker for the adjustment form */
export function useActiveProducts(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.products.list({ active: true }),
    queryFn: () => api.get<PaginatedResponse<Product>>('/products?active=true'),
    enabled: options?.enabled ?? true,
  })
}

export interface StockAdjustment {
  productId: string
  type: 'adjustment' | 'restock'
  qtyChange: number
  notes?: string
}

/** POST /stock/adjust */
export function useAdjustStock() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: StockAdjustment) => api.post('/stock/adjust', body),
    onSuccess: () => invalidateAfterStockAdjustment(queryClient),
  })
}
