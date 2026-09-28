import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api } from '../lib/api.ts'
import { queryKeys } from '../lib/query-keys.ts'
import { invalidateAfterProductChange } from './products.ts'
import type { Category } from '../types/index.ts'

/** Product rows embed categoryName, so category writes go stale along with products. */
export function invalidateAfterCategoryChange(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: queryKeys.categories.all })
  invalidateAfterProductChange(queryClient)
}

/** GET /categories */
export function useCategories() {
  return useQuery({
    queryKey: queryKeys.categories.list(),
    queryFn: () => api.get<Category[]>('/categories'),
  })
}

/** POST /categories or PATCH /categories/:id */
export function useSaveCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id?: string; name: string }) =>
      id ? api.patch(`/categories/${id}`, { name }) : api.post('/categories', { name }),
    onSuccess: () => invalidateAfterCategoryChange(queryClient),
  })
}

/** PATCH /categories/:id — flip isActive */
export function useToggleCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (category: Category) =>
      api.patch(`/categories/${category.id}`, { isActive: !category.isActive }),
    onSuccess: () => invalidateAfterCategoryChange(queryClient),
  })
}
