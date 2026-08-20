import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { sql, and, gte, lte } from 'drizzle-orm'
import { db } from '../db/client.js'
import { sales, saleItems, products, categories } from '../db/schema.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { validateQuery } from '../lib/query-validation.js'

const salesReportQuerySchema = z.object({
  start: z.string().datetime().or(z.string().date()),
  end: z.string().datetime().or(z.string().date()),
  format: z.enum(['csv', 'json', 'html']).optional().default('json'),
})

const productsReportQuerySchema = z.object({
  start: z.string().datetime().or(z.string().date()),
  end: z.string().datetime().or(z.string().date()),
  format: z.enum(['csv', 'json']).optional().default('json'),
})

const categoriesReportQuerySchema = z.object({
  start: z.string().datetime().or(z.string().date()),
  end: z.string().datetime().or(z.string().date()),
})

const BUSINESS_TIME_ZONE = 'Asia/Jakarta'

function businessDateSql(column: typeof sales.createdAt) {
  return sql`(${column} AT TIME ZONE ${sql.raw(`'${BUSINESS_TIME_ZONE}'`)})::date`
}

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
    const reportDate = businessDateSql(sales.createdAt)

    const conditions = [
      gte(sales.createdAt, new Date(start)),
      lte(sales.createdAt, new Date(end)),
    ]

    const rows = await db
      .select({
        date: sql<string>`${reportDate}`.as('date'),
        totalSales: sql<number>`COUNT(*)`.as('totalSales'),
        totalRevenue: sql<number>`COALESCE(SUM(${sales.grandTotal}), 0)`.as('totalRevenue'),
        totalDiscount: sql<number>`COALESCE(SUM(${sales.discountTotal}), 0)`.as('totalDiscount'),
        totalTax: sql<number>`COALESCE(SUM(${sales.taxTotal}), 0)`.as('totalTax'),
      })
      .from(sales)
      .where(and(...conditions, sql`${sales.status} != 'void'`))
      .groupBy(reportDate)
      .orderBy(reportDate)

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

    if (format === 'html') {
      const fmt = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 })
      const bodyRows = rows
        .map(
          (r) => `<tr><td>${r.date}</td><td class="num">${r.totalSales}</td><td class="num">${fmt.format(r.totalDiscount)}</td><td class="num">${fmt.format(r.totalTax)}</td><td class="num"><strong>${fmt.format(r.totalRevenue)}</strong></td></tr>`,
        )
        .join('')
      const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Laporan Penjualan</title>
<style>body{font-family:Inter,Arial,sans-serif;margin:2rem;color:#0f172a}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #e2e8f0;padding:8px 12px;text-align:left}th{background:#f1f5f9}.num{text-align:right;font-variant-numeric:tabular-nums}h1{font-size:20px}.meta{color:#64748b;font-size:13px;margin-bottom:1rem}.totals{margin-top:1.5rem;font-size:14px}@media print{button{display:none}}</style></head>
<body><button onclick="window.print()" style="margin-bottom:1rem;padding:8px 16px">Cetak / Simpan PDF</button>
<h1>Laporan Penjualan</h1><p class="meta">Periode ${start} &ndash; ${end}</p>
<table><thead><tr><th>Tanggal</th><th>Transaksi</th><th>Diskon</th><th>Pajak</th><th>Omzet</th></tr></thead><tbody>${bodyRows || '<tr><td colspan="5">Tidak ada data</td></tr>'}</tbody></table>
<div class="totals"><p><strong>Total Transaksi:</strong> ${summary?.totalSales ?? 0}</p><p><strong>Total Diskon:</strong> ${fmt.format(summary?.totalDiscount ?? 0)}</p><p><strong>Total Pajak:</strong> ${fmt.format(summary?.totalTax ?? 0)}</p><p><strong>Total Omzet:</strong> ${fmt.format(summary?.totalRevenue ?? 0)}</p></div>
</body></html>`
      reply.header('Content-Type', 'text/html; charset=utf-8')
      return html
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

  // GET /api/reports/categories?start=&end= — sales breakdown by category
  app.get('/categories', async (request) => {
    const { start, end } = validateQuery(categoriesReportQuerySchema, request.query)

    const rows = await db
      .select({
        categoryId: products.categoryId,
        categoryName: sql<string>`COALESCE(${categories.name}, 'Tanpa Kategori')`.as('categoryName'),
        totalQty: sql<number>`COALESCE(SUM(${saleItems.qty}), 0)`.as('totalQty'),
        totalRevenue: sql<number>`COALESCE(SUM(${saleItems.subtotal}), 0)`.as('totalRevenue'),
      })
      .from(saleItems)
      .innerJoin(sales, sql`${saleItems.saleId} = ${sales.id}`)
      .innerJoin(products, sql`${saleItems.productId} = ${products.id}`)
      .leftJoin(categories, sql`${products.categoryId} = ${categories.id}`)
      .where(
        and(
          gte(sales.createdAt, new Date(start)),
          lte(sales.createdAt, new Date(end)),
          sql`${sales.status} != 'void'`,
        ),
      )
      .groupBy(products.categoryId, categories.name)
      .orderBy(sql`COALESCE(SUM(${saleItems.subtotal}), 0) DESC`)

    return rows
  })
}
