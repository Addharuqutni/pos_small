import { eq, and, or, ilike, desc, gte, lte, count } from 'drizzle-orm'
import type { Db } from '../db/types.js'
import { sales, users } from '../db/schema.js'
import { escapeLikePattern } from '../lib/query-validation.js'
import { NotFound } from '../lib/errors.js'
import { getSaleWithDetails, type SaleActor, type SaleWithDetails } from './sale-ledger.js'

export interface SaleListParams {
  page: number
  limit: number
  start?: string
  end?: string
  status?: 'paid' | 'void' | 'refunded' | 'partial_refunded'
  q?: string
}

export interface SaleListResult {
  data: {
    id: string
    invoiceNo: string
    cashierId: string
    shiftId: string
    subtotal: number
    discountTotal: number
    taxTotal: number
    grandTotal: number
    paidTotal: number
    changeTotal: number
    status: 'paid' | 'void' | 'refunded' | 'partial_refunded'
    createdAt: Date
    updatedAt: Date
    cashier: { id: string; name: string; email: string; role: string; isActive: boolean }
  }[]
  total: number
  page: number
  limit: number
}

/**
 * Visibility scope: cashiers may only read their own sales; owner/admin see all.
 */
export function canReadSale(actor: Pick<SaleActor, 'id' | 'role'>, sale: { cashierId: string }): boolean {
  return actor.role !== 'cashier' || sale.cashierId === actor.id
}

/** Paginated sale list, scoped to what the actor may see. */
export async function listSales(db: Db, actor: Pick<SaleActor, 'id' | 'role'>, params: SaleListParams): Promise<SaleListResult> {
  const { page, limit, start, end, status, q } = params

  const conditions = []
  if (actor.role === 'cashier') conditions.push(eq(sales.cashierId, actor.id))
  if (start) conditions.push(gte(sales.createdAt, new Date(start)))
  if (end) conditions.push(lte(sales.createdAt, new Date(end)))
  if (status) conditions.push(eq(sales.status, status))
  if (q) {
    const searchPattern = `%${escapeLikePattern(q)}%`
    conditions.push(or(
      ilike(sales.invoiceNo, searchPattern),
      ilike(users.name, searchPattern),
    ))
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined
  const offset = (page - 1) * limit

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: sales.id,
        invoiceNo: sales.invoiceNo,
        cashierId: sales.cashierId,
        shiftId: sales.shiftId,
        subtotal: sales.subtotal,
        discountTotal: sales.discountTotal,
        taxTotal: sales.taxTotal,
        grandTotal: sales.grandTotal,
        paidTotal: sales.paidTotal,
        changeTotal: sales.changeTotal,
        status: sales.status,
        createdAt: sales.createdAt,
        updatedAt: sales.updatedAt,
        cashier: {
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          isActive: users.isActive,
        },
      })
      .from(sales)
      .innerJoin(users, eq(sales.cashierId, users.id))
      .where(where)
      .orderBy(desc(sales.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(sales)
      .innerJoin(users, eq(sales.cashierId, users.id))
      .where(where),
  ])

  return { data: rows, total: totalRows[0]?.total ?? 0, page, limit }
}

/**
 * Sale details for the acting user. Cashiers get a 404 (not 403) for sales that
 * belong to somebody else, so the endpoint leaks nothing.
 */
export async function saleDetailForActor(db: Db, actor: Pick<SaleActor, 'id' | 'role'>, saleId: string): Promise<SaleWithDetails> {
  const detail = await getSaleWithDetails(db, saleId)
  if (!canReadSale(actor, detail)) throw new NotFound('Transaksi tidak ditemukan')
  return detail
}
