import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api.ts'
import { queryKeys } from '../lib/query-keys.ts'
import type { StoreSettings } from '../types/index.ts'

/**
 * POS chrome (layout store name, cashier tax config) holds settings for ten
 * minutes so the configuration cannot flicker mid-sale. Editor and receipt
 * views use `useSettings`, which follows the app-wide default.
 */
const POS_SETTINGS_STALE_TIME = 10 * 60 * 1000

/** GET /settings — for the settings editor and receipt views */
export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings.all,
    queryFn: () => api.get<StoreSettings>('/settings'),
  })
}

/** GET /settings — cached config for the POS shell while a sale is in progress */
export function usePosSettings() {
  return useQuery({
    queryKey: queryKeys.settings.all,
    queryFn: () => api.get<StoreSettings>('/settings'),
    staleTime: POS_SETTINGS_STALE_TIME,
  })
}

/** PATCH /settings */
export function useSaveSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: StoreSettings) => api.patch('/settings', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.all })
    },
  })
}
