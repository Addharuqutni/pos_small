import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api } from '../lib/api.ts'
import { queryKeys } from '../lib/query-keys.ts'
import type { PaginatedResponse, Product } from '../types/index.ts'

/** Product list params shared by the catalogue, cashier and stock pickers. */
export interface ProductListParams {
  search?: string
  category?: string
  active?: boolean
}

/** Product writes change stock levels too, hence the low-stock report. */
export function invalidateAfterProductChange(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: queryKeys.products.all })
  queryClient.invalidateQueries({ queryKey: queryKeys.reports.lowStock() })
}

function productsQueryOptions(params: ProductListParams) {
  const { search, category, active } = params
  return {
    queryKey: queryKeys.products.list({ search, category, active }),
    queryFn: () => {
      const query = new URLSearchParams()
      if (search) query.set('search', search)
      if (category) query.set('category', category)
      if (active !== undefined) query.set('active', String(active))
      const qs = query.toString()
      return api.get<PaginatedResponse<Product>>(`/products${qs ? `?${qs}` : ''}`)
    },
  }
}

/** GET /products */
export function useProducts(params: ProductListParams = {}) {
  return useQuery(productsQueryOptions(params))
}

/** Imperative product lookup (barcode scanner) that shares the products list cache. */
export function findProducts(queryClient: QueryClient, params: ProductListParams) {
  return queryClient.fetchQuery(productsQueryOptions(params))
}

/** Body accepted by POST /products and PATCH /products/:id */
export interface ProductInput {
  name: string
  sku: string | null
  barcode: string | null
  categoryId: string | null
  imageData: string | null
  price: number
  costPrice: number
  stock: number
  minStock: number
  trackStock: boolean
  allowNegativeStock: boolean
}

/** POST /products or PATCH /products/:id */
export function useSaveProduct() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: ProductInput & { id?: string }) =>
      id ? api.patch(`/products/${id}`, body) : api.post('/products', body),
    onSuccess: () => invalidateAfterProductChange(queryClient),
  })
}

/** PATCH /products/:id — flip isActive */
export function useToggleProduct() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (product: Product) => api.patch(`/products/${product.id}`, { isActive: !product.isActive }),
    onSuccess: () => invalidateAfterProductChange(queryClient),
  })
}
