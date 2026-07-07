import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { sql, and, gte, lte } from 'drizzle-orm'
import { db } from '../db/client.js'
import { sales, saleItems, products } from '../db/schema.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { BadRequest } from '../lib/errors.js'
import { validateQuery } from '../lib/query-validation.js'

const salesReportQuerySchema = z.object({
  start: z.string().datetime().or(z.string().date()),
  end: z.string().datetime().or(z.string().date()),
  format: z.enum(['csv', 'json']).optional().default('json'),
})

const productsReportQuerySchema = z.object({
  start: z.string().datetime().or(z.string().date()),
  end: z.string().datetime().or(z.string().date()),
  format: z.enum(['csv', 'json']).optional().default('json'),
})

/**
 * Sanitize a date-like string for safe use in HTTP headers (remove CR/LF/quotes).
 */
function sanitizeForHeader(input: string): string {
  return input.replace(/[\r\n"]/g, '')
}

function toCsv<T extends object>(headers: (Extract<keyof T, string>)[], rows: T[]): string {
  const escape = (v: T[Extract<keyof T, string>]) => {
    const s = String(v ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','))
  }
  return lines.join('\n')
}

export async function reportRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth)
  app.addHook('preHandler', requireRole('owner', 'admin'))

  // GET /api/reports/sales?start=&end=&format=csv
  app.get('/sales', async (request, reply) => {
    const { start, end, format } = validateQuery(salesReportQuerySchema, request.query)

    const conditions = [
      gte(sales.createdAt, new Date(start)),
      lte(sales.createdAt, new Date(end)),
    ]

    const rows = await db
      .select({
        date: sql<string>`DATE(${sales.createdAt})`.as('date'),
        totalSales: sql<number>`COUNT(*)`.as('totalSales'),
        totalRevenue: sql<number>`COALESCE(SUM(${sales.grandTotal}), 0)`.as('totalRevenue'),
        totalDiscount: sql<number>`COALESCE(SUM(${sales.discountTotal}), 0)`.as('totalDiscount'),
        totalTax: sql<number>`COALESCE(SUM(${sales.taxTotal}), 0)`.as('totalTax'),
      })
      .from(sales)
      .where(and(...conditions, sql`${sales.status} != 'void'`))
      .groupBy(sql`DATE(${sales.createdAt})`)
      .orderBy(sql`DATE(${sales.createdAt})`)

    // Summary
    const [summary] = await db
      .select({
        totalSales: sql<number>`COUNT(*)`,
        totalRevenue: sql<number>`COALESCE(SUM(${sales.grandTotal}), 0)`,
        totalDiscount: sql<number>`COALESCE(SUM(${sales.discountTotal}), 0)`,
        totalTax: sql<number>`COALESCE(SUM(${sales.taxTotal}), 0)`,
      })
      .from(sales)
      .where(and(...conditions, sql`${sales.status} != 'void'`))

    if (format === 'csv') {
      const csv = toCsv(
        ['date', 'totalSales', 'totalRevenue', 'totalDiscount', 'totalTax'],
        rows,
      )
      reply.header('Content-Type', 'text/csv')
      reply.header(
        'Content-Disposition',
        `attachment; filename="sales-report-${sanitizeForHeader(start)}-${sanitizeForHeader(end)}.csv"`,
      )
      return csv
    }

    return { daily: rows, summary }
  })

  // GET /api/reports/products?start=&end=
  app.get('/products', async (request, reply) => {
    const { start, end, format } = validateQuery(productsReportQuerySchema, request.query)

    const rows = await db
      .select({
        productId: saleItems.productId,
        productName: saleItems.productNameSnapshot,
        totalQty: sql<number>`COALESCE(SUM(${saleItems.qty}), 0)`.as('totalQty'),
        totalRevenue: sql<number>`COALESCE(SUM(${saleItems.subtotal}), 0)`.as('totalRevenue'),
      })
      .from(saleItems)
      .innerJoin(sales, sql`${saleItems.saleId} = ${sales.id}`)
      .where(
        and(
          gte(sales.createdAt, new Date(start)),
          lte(sales.createdAt, new Date(end)),
          sql`${sales.status} != 'void'`,
        ),
      )
      .groupBy(saleItems.productId, saleItems.productNameSnapshot)
      .orderBy(sql`COALESCE(SUM(${saleItems.qty}), 0) DESC`)

    if (format === 'csv') {
      const csv = toCsv(
        ['productId', 'productName', 'totalQty', 'totalRevenue'],
        rows,
      )
      reply.header('Content-Type', 'text/csv')
      reply.header(
        'Content-Disposition',
        `attachment; filename="product-report-${sanitizeForHeader(start)}-${sanitizeForHeader(end)}.csv"`,
      )
      return csv
    }

    return rows
  })

  // GET /api/reports/low-stock
  app.get('/low-stock', async () => {
    const rows = await db
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        stock: products.stock,
        minStock: products.minStock,
      })
      .from(products)
      .where(
        and(
          sql`${products.trackStock} = true`,
          sql`${products.isActive} = true`,
          sql`${products.stock} <= ${products.minStock}`,
        ),
      )
      .orderBy(products.stock)

    return rows
  })
}
