import { and, eq, gte, lte, ne, sql, type SQL } from 'drizzle-orm'
import type { Db } from '../db/types.js'
import { categories, products, refundItems, saleItems, sales } from '../db/schema.js'
import { BUSINESS_TIME_ZONE, reportFilterConditions, type ReportFilters } from './report-filters.js'

export type ProfitGroupBy = 'product' | 'category' | 'day'

/** One aggregated profit row; money is integer rupiah. */
export interface ProfitRow {
  /** Product id / category id (null for uncategorised products) / YYYY-MM-DD. */
  key: string | null
  label: string
  qty: number
  revenue: number
  cogs: number
  grossProfit: number
  /** grossProfit / revenue × 100, one decimal; null when revenue is 0. */
  marginPct: number | null
  /** True when any included item's cost was backfilled from the product. */
  hasEstimatedCost: boolean
}

export interface ProfitReport {
  rows: ProfitRow[]
  summary: {
    revenue: number
    cogs: number
    grossProfit: number
    marginPct: number | null
    hasEstimatedCost: boolean
  }
}

export interface ProfitReportParams {
  start: string
  end: string
  groupBy: ProfitGroupBy
  filters?: ReportFilters
}

const UNCATEGORISED = 'Tanpa kategori'

/**
 * Profit per sale item of non-void sales in range.
 *
 * Sale-level discounts (promo + manual) are spread proportionally over the items:
 * `allocated revenue = item.subtotal × (sale.subtotal − promo_discount − discount) / sale.subtotal`
 * (0 when the sale subtotal is 0); tax is excluded. Refunds of an item reduce its
 * revenue by the refunded amounts and its qty by the refunded qty; COGS is the
 * item's cost snapshot times the net qty. Money math runs in SQL numeric and is
 * rounded to whole rupiah per group, so proportional allocation never loses or
 * invents a rupiah.
 *
 * Void sales are always excluded, and `productId`/`categoryId` filter individual
 * costed items (a mixed sale contributes only its matching lines); the remaining
 * report filters stay sale-level.
 */
export async function profitReport(db: Db, params: ProfitReportParams): Promise<ProfitReport> {
  const { start, end, groupBy } = params
  const businessDate = sql`(${sales.createdAt} AT TIME ZONE ${sql.raw(`'${BUSINESS_TIME_ZONE}'`)})::date`

  const refundedQty = sql`COALESCE((
    SELECT SUM(${refundItems.qty}) FROM ${refundItems}
    WHERE ${refundItems.saleItemId} = ${saleItems.id}
  ), 0)`
  const refundedAmount = sql`COALESCE((
    SELECT SUM(${refundItems.amount}) FROM ${refundItems}
    WHERE ${refundItems.saleItemId} = ${saleItems.id}
  ), 0)`

  // Sale-level discount factor: (subtotal − promo − manual) / subtotal, 0 if subtotal is 0.
  const discountFactor = sql`CASE WHEN ${sales.subtotal} = 0 THEN 0
    ELSE (${sales.subtotal} - ${sales.promoDiscount} - ${sales.discount})::numeric / ${sales.subtotal} END`
  const netRevenue = sql`(${saleItems.subtotal} - ${refundedAmount}) * ${discountFactor}`
  const netQty = sql`${saleItems.qty} - ${refundedQty}`
  const itemCogs = sql`${saleItems.costPrice} * (${saleItems.qty} - ${refundedQty})`

  const keyExpr: SQL =
    groupBy === 'product'
      ? sql`${saleItems.productId}::text`
      : groupBy === 'category'
        ? sql`${products.categoryId}::text`
        : sql`to_char(${businessDate}, 'YYYY-MM-DD')`

  const labelExpr: SQL =
    groupBy === 'product'
      ? sql`MIN(${saleItems.productNameSnapshot})`
      : groupBy === 'category'
        ? sql`COALESCE(MIN(${categories.name}), ${UNCATEGORISED})`
        : sql`to_char(${businessDate}, 'YYYY-MM-DD')`

  // Profit always drops void sales — an explicit `status` only narrows further
  // (so `status=void` yields nothing). `productId`/`categoryId` address the ITEM
  // here rather than the whole sale, so they are lifted out of the shared
  // sale-level filters and applied to the costed rows.
  const { productId, categoryId, ...saleFilters } = params.filters ?? {}
  const conditions: SQL[] = [
    gte(sales.createdAt, new Date(start)),
    lte(sales.createdAt, new Date(end)),
    ...reportFilterConditions(saleFilters, { excludeVoidByDefault: false }),
    ne(sales.status, 'void'),
  ]
  if (productId) conditions.push(eq(saleItems.productId, productId))
  if (categoryId) conditions.push(eq(products.categoryId, categoryId))

  const rows = await db
    .select({
      key: sql<string | null>`${keyExpr}`.as('key'),
      label: sql<string | null>`${labelExpr}`.as('label'),
      qty: sql<number>`ROUND(COALESCE(SUM(${netQty}), 0))`.as('qty'),
      revenue: sql<number>`ROUND(COALESCE(SUM(${netRevenue}), 0))`.as('revenue'),
      cogs: sql<number>`ROUND(COALESCE(SUM(${itemCogs}), 0))`.as('cogs'),
      hasEstimatedCost: sql<boolean>`BOOL_OR(${saleItems.costEstimated})`.as('hasEstimatedCost'),
    })
    .from(saleItems)
    .innerJoin(sales, eq(saleItems.saleId, sales.id))
    .innerJoin(products, eq(saleItems.productId, products.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(...conditions))
    .groupBy(groupBy === 'day' ? businessDate : keyExpr)
    .orderBy(sql`${keyExpr} ASC`)

  const grouped: ProfitRow[] = rows.map((row) => {
    const revenue = Number(row.revenue)
    const cogs = Number(row.cogs)
    const grossProfit = revenue - cogs
    return {
      key: row.key,
      label: row.label ?? '',
      qty: Number(row.qty),
      revenue,
      cogs,
      grossProfit,
      marginPct: revenue <= 0 ? null : Math.round((grossProfit / revenue) * 1000) / 10,
      hasEstimatedCost: row.hasEstimatedCost === true,
    }
  })

  const revenue = grouped.reduce((sum, row) => sum + row.revenue, 0)
  const cogs = grouped.reduce((sum, row) => sum + row.cogs, 0)
  const grossProfit = revenue - cogs

  return {
    rows: grouped,
    summary: {
      revenue,
      cogs,
      grossProfit,
      marginPct: revenue <= 0 ? null : Math.round((grossProfit / revenue) * 1000) / 10,
      hasEstimatedCost: grouped.some((row) => row.hasEstimatedCost),
    },
  }
}
