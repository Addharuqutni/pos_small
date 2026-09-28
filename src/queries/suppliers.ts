import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api } from '../lib/api.ts'
import { queryKeys } from '../lib/query-keys.ts'
import type { Supplier } from '../types/index.ts'

/** Supplier writes affect the purchase form's supplier picker. */
export function invalidateAfterSupplierChange(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.all })
}

export interface SupplierInput {
  name: string
  phone: string | null
  address: string | null
}

/** GET /suppliers */
export function useSuppliers() {
  return useQuery({
    queryKey: queryKeys.suppliers.list(),
    queryFn: () => api.get<Supplier[]>('/suppliers'),
  })
}

/** POST /suppliers or PATCH /suppliers/:id */
export function useSaveSupplier() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: SupplierInput & { id?: string }) =>
      id ? api.patch(`/suppliers/${id}`, body) : api.post('/suppliers', body),
    onSuccess: () => invalidateAfterSupplierChange(queryClient),
  })
}

/** PATCH /suppliers/:id — flip isActive */
export function useToggleSupplier() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (supplier: Supplier) =>
      api.patch(`/suppliers/${supplier.id}`, { isActive: !supplier.isActive }),
    onSuccess: () => invalidateAfterSupplierChange(queryClient),
  })
}
