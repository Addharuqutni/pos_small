import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { ApiError, api } from '../lib/api.ts'
import { queryKeys } from '../lib/query-keys.ts'
import { alwaysFresh } from './fresh.ts'
import type { Shift, ShiftReportRow } from '../types/index.ts'

/** Opening or closing a shift changes the shift report and the active shift. */
export function invalidateAfterShiftChange(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: queryKeys.reports.shifts() })
}

/**
 * Fetch the cashier's open shift. A 404 means "no open shift", which is a
 * valid state the UI renders as "Shift belum buka" — every other failure must
 * still surface as a query error.
 */
export async function fetchActiveShift(): Promise<Shift | null> {
  try {
    return await api.get<Shift>('/shifts/active')
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  }
}

/** GET /shifts/active — a 404 means "no open shift", which is a valid state. */
export function useActiveShift() {
  return useQuery({
    queryKey: queryKeys.shifts.active,
    queryFn: fetchActiveShift,
    retry: false,
  })
}

/** GET /shifts/report — owner/admin shift reconciliation rows */
export function useShiftReport() {
  return useQuery({
    queryKey: queryKeys.reports.shifts(),
    queryFn: () => api.get<ShiftReportRow[]>('/shifts/report'),
    ...alwaysFresh,
  })
}

/** POST /shifts/open */
export function useOpenShift() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { openingCash: number }) => api.post<Shift>('/shifts/open', data),
    onSuccess: (shift) => {
      queryClient.setQueryData(queryKeys.shifts.active, shift)
      invalidateAfterShiftChange(queryClient)
    },
  })
}

/** POST /shifts/close */
export function useCloseShift() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { closingCash: number }) => api.post<Shift>('/shifts/close', data),
    onSuccess: () => {
      queryClient.setQueryData(queryKeys.shifts.active, null)
      invalidateAfterShiftChange(queryClient)
    },
  })
}
