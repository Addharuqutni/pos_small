import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api.ts'
import { queryKeys } from '../lib/query-keys.ts'
import { alwaysFresh } from './fresh.ts'
import type {
  CategoryReportRow,
  LowStockProduct,
  ProductReportRow,
  SalesReportResponse,
} from '../types/index.ts'

/**
 * Report queries take the local `yyyy-mm-dd` values shown in the date inputs
 * plus the matching UTC day bounds the API filters on. Local values are kept
 * in the query key (stable across re-renders), the ISO bounds go to the API.
 */
export interface ReportRange {
  startDate: string
  endDate: string
  startQuery: string
  endQuery: string
}

/** GET /reports/sales */
export function useSalesReport({ startDate, endDate, startQuery, endQuery }: ReportRange, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.reports.sales({ startDate, endDate }),
    queryFn: () => api.get<SalesReportResponse>(`/reports/sales?start=${startQuery}&end=${endQuery}`),
    enabled: options?.enabled ?? true,
    ...alwaysFresh,
  })
}

/** GET /reports/products — best sellers for the range */
export function useProductsReport({ startDate, endDate, startQuery, endQuery }: ReportRange) {
  return useQuery({
    queryKey: queryKeys.reports.products({ startDate, endDate }),
    queryFn: () => api.get<ProductReportRow[]>(`/reports/products?start=${startQuery}&end=${endQuery}`),
    ...alwaysFresh,
  })
}

/** GET /reports/categories — revenue breakdown by category */
export function useCategoriesReport({ startDate, endDate, startQuery, endQuery }: ReportRange) {
  return useQuery({
    queryKey: queryKeys.reports.categories({ startDate, endDate }),
    queryFn: () => api.get<CategoryReportRow[]>(`/reports/categories?start=${startQuery}&end=${endQuery}`),
    ...alwaysFresh,
  })
}

/** GET /reports/low-stock */
export function useLowStock(options?: { refetchInterval?: number }) {
  return useQuery({
    queryKey: queryKeys.reports.lowStock(),
    queryFn: () => api.get<LowStockProduct[]>('/reports/low-stock'),
    ...alwaysFresh,
    refetchInterval: options?.refetchInterval,
  })
}

/**
 * Download URLs for the sales report export (PRD §9.9). These are fetched by
 * the browser itself, so they point at the API path rather than the `api`
 * helper — pages only open the returned URL with `window.open`.
 */
export function salesReportExportUrl({ startQuery, endQuery }: Pick<ReportRange, 'startQuery' | 'endQuery'>, format: 'csv' | 'html') {
  return `/api/reports/sales?start=${startQuery}&end=${endQuery}&format=${format}`
}
