import { and, eq, gte, lte, sql } from 'drizzle-orm'
import type { Db } from '../db/types.js'
import { refundItems, refunds, sales, users } from '../db/schema.js'
import { reportFilterConditions, type ReportFilters } from './report-filters.js'

/** One row of the cashier report; money is integer rupiah. */
export interface CashierReportRow {
  cashierId: string
  cashierName: string
  /** Non-void sales only. */
  saleCount: number
  grossSales: number
  discountTotal: number
  voidCount: number
  voidTotal: number
  /** Refunded item amounts of this cashier's sales in range. */
  refundTotal: number
  /** grossSales − refundTotal. */
  netSales: number
}

export interface CashierReportParams {
  start: string
  end: string
  filters?: ReportFilters
}

/**
 * Per-cashier sales summary for a date range (business date bucketing handled by
 * the caller's range). Non-void sales feed saleCount/grossSales/discountTotal;
 * void sales feed voidCount/voidTotal; refundTotal sums refunded item amounts on
 * the cashier's sales; netSales = grossSales − refundTotal.
 *
 * The shared `status` filter selects a single bucket; when it is absent the
 * report sees both non-void and void sales (it needs the latter for voidCount).
 */
export async function cashierReport(db: Db, params: CashierReportParams): Promise<CashierReportRow[]> {
  const rows = await db
    .select({
      cashierId: sales.cashierId,
      cashierName: sql<string>`MIN(${users.name})`.as('cashierName'),
      saleCount: sql<number>`COUNT(*) FILTER (WHERE ${sales.status} != 'void')`.as('saleCount'),
      grossSales: sql<number>`COALESCE(SUM(${sales.grandTotal}) FILTER (WHERE ${sales.status} != 'void'), 0)`.as('grossSales'),
      discountTotal: sql<number>`COALESCE(SUM(${sales.discountTotal}) FILTER (WHERE ${sales.status} != 'void'), 0)`.as('discountTotal'),
      voidCount: sql<number>`COUNT(*) FILTER (WHERE ${sales.status} = 'void')`.as('voidCount'),
      voidTotal: sql<number>`COALESCE(SUM(${sales.grandTotal}) FILTER (WHERE ${sales.status} = 'void'), 0)`.as('voidTotal'),
    })
    .from(sales)
    .innerJoin(users, eq(sales.cashierId, users.id))
    .where(and(
      gte(sales.createdAt, new Date(params.start)),
      lte(sales.createdAt, new Date(params.end)),
      // A `status` filter narrows every bucket; absent, both void and non-void
      // sales stay in scope so voidCount can be reported.
      ...reportFilterConditions(params.filters ?? {}, { excludeVoidByDefault: false }),
    ))
    .groupBy(sales.cashierId)
    .orderBy(sql`MIN(${users.name}) ASC`)

  const refundRows = await db
    .select({
      cashierId: sales.cashierId,
      refundTotal: sql<number>`COALESCE(SUM(${refundItems.amount}), 0)`.as('refundTotal'),
    })
    .from(refundItems)
    .innerJoin(refunds, eq(refundItems.refundId, refunds.id))
    .innerJoin(sales, eq(refunds.saleId, sales.id))
    .where(and(
      gte(sales.createdAt, new Date(params.start)),
      lte(sales.createdAt, new Date(params.end)),
      ...reportFilterConditions(params.filters ?? {}, { excludeVoidByDefault: false }),
    ))
    .groupBy(sales.cashierId)

  const refundByCashier = new Map(refundRows.map((row) => [row.cashierId, Number(row.refundTotal)]))

  return rows.map((row) => {
    const grossSales = Number(row.grossSales)
    const refundTotal = refundByCashier.get(row.cashierId) ?? 0
    return {
      cashierId: row.cashierId,
      cashierName: row.cashierName,
      saleCount: Number(row.saleCount),
      grossSales,
      discountTotal: Number(row.discountTotal),
      voidCount: Number(row.voidCount),
      voidTotal: Number(row.voidTotal),
      refundTotal,
      netSales: grossSales - refundTotal,
    }
  })
}
