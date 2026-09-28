import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api.ts'
import { queryKeys } from '../lib/query-keys.ts'
import { alwaysFresh } from './fresh.ts'
import type {
  CashiersReportResponse,
  CategoryReportRow,
  LowStockProduct,
  PaymentMethod,
  ProductReportRow,
  ProfitGroupBy,
  ProfitReportResponse,
  SaleStatus,
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

/**
 * Optional filters accepted by every report endpoint. Omitting `status` keeps
 * the API default for the sales report, which excludes void sales.
 */
export interface ReportFilters {
  cashierId?: string
  paymentMethod?: PaymentMethod
  status?: SaleStatus
  categoryId?: string
  productId?: string
}

/**
 * Query string shared by every report hook and by the CSV/HTML export URLs,
 * so a download always carries the range and filters the page is showing.
 */
export function reportSearchParams(
  { startQuery, endQuery }: Pick<ReportRange, 'startQuery' | 'endQuery'>,
  filters: ReportFilters = {},
  extra: Record<string, string> = {},
): URLSearchParams {
  const params = new URLSearchParams({ start: startQuery, end: endQuery })
  if (filters.cashierId) params.set('cashierId', filters.cashierId)
  if (filters.paymentMethod) params.set('paymentMethod', filters.paymentMethod)
  if (filters.status) params.set('status', filters.status)
  if (filters.categoryId) params.set('categoryId', filters.categoryId)
  if (filters.productId) params.set('productId', filters.productId)
  for (const [key, value] of Object.entries(extra)) params.set(key, value)
  return params
}

/** Query key material: local range + active filters (filters change the data). */
function reportKeyParams(
  { startDate, endDate }: ReportRange,
  filters: ReportFilters,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { startDate, endDate, ...filters, ...extra }
}

/** GET /reports/sales */
export function useSalesReport(
  range: ReportRange,
  filters: ReportFilters = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.reports.sales(reportKeyParams(range, filters)),
    queryFn: () => api.get<SalesReportResponse>(`/reports/sales?${reportSearchParams(range, filters)}`),
    enabled: options?.enabled ?? true,
    ...alwaysFresh,
  })
}

/** GET /reports/products — best sellers for the range */
export function useProductsReport(range: ReportRange, filters: ReportFilters = {}) {
  return useQuery({
    queryKey: queryKeys.reports.products(reportKeyParams(range, filters)),
    queryFn: () => api.get<ProductReportRow[]>(`/reports/products?${reportSearchParams(range, filters)}`),
    ...alwaysFresh,
  })
}

/** GET /reports/categories — revenue breakdown by category */
export function useCategoriesReport(range: ReportRange, filters: ReportFilters = {}) {
  return useQuery({
    queryKey: queryKeys.reports.categories(reportKeyParams(range, filters)),
    queryFn: () => api.get<CategoryReportRow[]>(`/reports/categories?${reportSearchParams(range, filters)}`),
    ...alwaysFresh,
  })
}

/** GET /reports/cashiers — one row per cashier for the range */
export function useCashiersReport(
  range: ReportRange,
  filters: ReportFilters = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.reports.cashiers(reportKeyParams(range, filters)),
    queryFn: () => api.get<CashiersReportResponse>(`/reports/cashiers?${reportSearchParams(range, filters)}`),
    enabled: options?.enabled ?? true,
    ...alwaysFresh,
  })
}

/** GET /reports/profit — owner only; admins get a 403, so callers gate it. */
export function useProfitReport(
  range: ReportRange,
  groupBy: ProfitGroupBy,
  filters: ReportFilters = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.reports.profit(reportKeyParams(range, filters), groupBy),
    queryFn: () =>
      api.get<ProfitReportResponse>(`/reports/profit?${reportSearchParams(range, filters, { groupBy })}`),
    enabled: options?.enabled ?? true,
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
 * Download URLs for the report exports (PRD §9.9). These are fetched by the
 * browser itself, so they point at the API path rather than the `api` helper —
 * pages only open the returned URL with `window.open`.
 */
export function salesReportExportUrl(
  range: Pick<ReportRange, 'startQuery' | 'endQuery'>,
  filters: ReportFilters = {},
  format: 'csv' | 'html' = 'csv',
) {
  return `/api/reports/sales?${reportSearchParams(range, filters, { format })}`
}

/** GET /reports/cashiers with `format=csv` */
export function cashiersReportExportUrl(
  range: Pick<ReportRange, 'startQuery' | 'endQuery'>,
  filters: ReportFilters = {},
  format: 'csv' | 'json' = 'csv',
) {
  return `/api/reports/cashiers?${reportSearchParams(range, filters, { format })}`
}

/** GET /reports/profit with `format=csv` — the export keeps the active grouping */
export function profitReportExportUrl(
  range: Pick<ReportRange, 'startQuery' | 'endQuery'>,
  groupBy: ProfitGroupBy,
  filters: ReportFilters = {},
  format: 'csv' | 'json' = 'csv',
) {
  return `/api/reports/profit?${reportSearchParams(range, filters, { groupBy, format })}`
}
