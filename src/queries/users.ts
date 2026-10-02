import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api } from '../lib/api.ts'
import { queryKeys } from '../lib/query-keys.ts'
import type { User } from '../types/index.ts'

/** User writes change names, roles and active flags in the user list. */
export function invalidateAfterUserChange(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: queryKeys.users.all })
}

/** GET /users */
export function useUsers(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.users.list(),
    queryFn: () => api.get<User[]>('/users'),
    ...options,
  })
}

export interface UserInput {
  name: string
  email: string
  role: 'admin' | 'cashier'
  password?: string
}

/** POST /users or PATCH /users/:id — a blank password means "leave unchanged" */
export function useSaveUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...form }: UserInput & { id?: string }) => {
      const body: Record<string, unknown> = { ...form }
      if (!body.password) delete body.password
      return id ? api.patch(`/users/${id}`, body) : api.post('/users', body)
    },
    onSuccess: () => invalidateAfterUserChange(queryClient),
  })
}

/** PATCH /users/:id — flip isActive */
export function useToggleUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (user: User) => api.patch(`/users/${user.id}`, { isActive: !user.isActive }),
    onSuccess: () => invalidateAfterUserChange(queryClient),
  })
}

/** POST /users/:id/reset-password */
export function useResetUserPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      api.post(`/users/${id}/reset-password`, { password }),
  })
}
