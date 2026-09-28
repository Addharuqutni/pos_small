import { eq, ne, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { payments, products, saleItems, sales } from '../db/schema.js'

/** Store business timezone used for every report's day bucketing. */
export const BUSINESS_TIME_ZONE = 'Asia/Jakarta'

/** Sale-level filters shared by every report endpoint (`/api/reports/*`). */
export const reportFilterQuerySchema = z.object({
  /** Only sales billed by this cashier. */
  cashierId: z.string().uuid().optional(),
  /** Sale must have at least one payment with this method. */
  paymentMethod: z.enum(['cash', 'qris', 'transfer']).optional(),
  /** Exact sale status; absent means the report's default (void excluded). */
  status: z.enum(['paid', 'void', 'refunded', 'partial_refunded']).optional(),
  /** Sale must contain an item of a product in this category. */
  categoryId: z.string().uuid().optional(),
  /** Sale must contain an item of this product. */
  productId: z.string().uuid().optional(),
})

export type ReportFilters = z.infer<typeof reportFilterQuerySchema>

/**
 * SQL conditions on `sales` implementing the shared report filters — the single
 * place where filter params turn into SQL, so json/csv/html output all honour the
 * same rows.
 *
 * `status` is applied verbatim when given. When absent, `excludeVoidByDefault`
 * (true unless the caller opts out) keeps the reports' historical default of
 * dropping void sales; the cashier report opts out because it splits the sale set
 * into non-void and void buckets itself.
 */
export function reportFilterConditions(
  filters: ReportFilters = {},
  opts: { excludeVoidByDefault?: boolean } = {},
): SQL[] {
  const conditions: SQL[] = []

  if (filters.cashierId) conditions.push(eq(sales.cashierId, filters.cashierId))
  if (filters.status) {
    conditions.push(eq(sales.status, filters.status))
  } else if (opts.excludeVoidByDefault !== false) {
    conditions.push(ne(sales.status, 'void'))
  }

  if (filters.paymentMethod) {
    conditions.push(sql`exists (
      select 1 from ${payments}
      where ${payments.saleId} = ${sales.id} and ${payments.method} = ${filters.paymentMethod}
    )`)
  }

  if (filters.categoryId) {
    conditions.push(sql`exists (
      select 1 from ${saleItems}
      inner join ${products} on ${products.id} = ${saleItems.productId}
      where ${saleItems.saleId} = ${sales.id} and ${products.categoryId} = ${filters.categoryId}
    )`)
  }

  if (filters.productId) {
    conditions.push(sql`exists (
      select 1 from ${saleItems}
      where ${saleItems.saleId} = ${sales.id} and ${saleItems.productId} = ${filters.productId}
    )`)
  }

  return conditions
}

/**
 * The business calendar date (Asia/Jakarta, UTC+7, no DST) a timestamp falls on,
 * as SQL. Reports group and label their days with this.
 */
export function businessDateSql(column: typeof sales.createdAt): SQL<string> {
  return sql`(${column} AT TIME ZONE ${sql.raw(`'${BUSINESS_TIME_ZONE}'`)})::date`
}
