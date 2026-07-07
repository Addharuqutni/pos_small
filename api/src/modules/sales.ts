import type { FastifyInstance } from 'fastify'
import { eq, and, or, ilike, desc, sql, gte, lte, count, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client.js'
import {
  sales, saleItems, payments, products, shifts,
  stockMovements, refunds, refundItems, settings, users,
} from '../db/schema.js'
import { validate, validateIdParam } from '../lib/validation.js'
import { escapeLikePattern, paginationSchema, validateQuery } from '../lib/query-validation.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { logAudit } from '../lib/audit.js'
import { NotFound, BadRequest } from '../lib/errors.js'
import { nanoid } from 'nanoid'
import { getLineDiscountError, getRefundQuantityError, lineSubtotal } from '../lib/sales-rules.js'

type RefundItemRow = typeof refundItems.$inferSelect

// --- Schemas ---

const checkoutItemSchema = z.object({
  productId: z.string().uuid(),
  qty: z.number().int().min(1),
  discount: z.number().int().min(0).optional(),
})

const paymentSchema = z.object({
  method: z.enum(['cash', 'qris', 'transfer']),
  amount: z.number().int().min(0),
  referenceNo: z.string().max(255).nullable().optional(),
})

const checkoutSchema = z.object({
  items: z.array(checkoutItemSchema).min(1),
  payments: z.array(paymentSchema).min(1),
})

const refundSchema = z.object({
  reason: z.string().min(1),
  items: z.array(
    z.object({
      saleItemId: z.string().uuid(),
      qty: z.number().int().min(1),
    }),
  ).min(1),
})

// GET /api/sales query params
const listQuerySchema = paginationSchema.extend({
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
  status: z.enum(['paid', 'void', 'refunded', 'partial_refunded']).optional(),
  q: z.string().trim().optional(),
})

// --- Helpers ---

function generateInvoiceNo(): string {
  const now = new Date()
  const date = now.toISOString().slice(0, 10).replace(/-/g, '')
  return `INV-${date}-${nanoid(6).toUpperCase()}`
}

async function saleWithDetails(id: string) {
  const [sale] = await db.select().from(sales).where(eq(sales.id, id)).limit(1)
  if (!sale) throw new NotFound('Sale not found')

  const [items, paymentRows, refundRows, cashierRows] = await Promise.all([
    db.select().from(saleItems).where(eq(saleItems.saleId, id)),
    db.select().from(payments).where(eq(payments.saleId, id)),
    db.select().from(refunds).where(eq(refunds.saleId, id)),
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.id, sale.cashierId))
      .limit(1),
  ])

  let refundItemRows: RefundItemRow[] = []
  if (refundRows.length > 0) {
    const refundIds = refundRows.map((r) => r.id)
    refundItemRows = await db
      .select()
      .from(refundItems)
      .where(inArray(refundItems.refundId, refundIds))
  }

  const cashier = cashierRows.find((u) => u.id === sale.cashierId) ?? null

  return {
    ...sale,
    cashier: cashier ? {
      id: cashier.id,
      name: cashier.name,
      email: cashier.email,
      role: cashier.role,
      isActive: cashier.isActive,
    } : null,
    items,
    payments: paymentRows,
    refunds: refundRows.map((r) => ({
      ...r,
      items: refundItemRows.filter((ri) => ri.refundId === r.id),
    })),
  }
}

export async function saleRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth)

  // POST /api/sales — atomic checkout
  app.post('/', async (request, reply) => {
    const body = validate(checkoutSchema, request.body)

    // Must have open shift
    const [shift] = await db
      .select({ id: shifts.id })
      .from(shifts)
      .where(and(eq(shifts.cashierId, request.user.id), eq(shifts.status, 'open')))
      .orderBy(desc(shifts.openedAt))
      .limit(1)

    if (!shift) throw new BadRequest('No open shift')

    // Load settings for tax
    const [storeSettings] = await db.select().from(settings).limit(1)
    const taxEnabled = storeSettings?.taxEnabled ?? false
    const taxRate = storeSettings?.taxRate ?? 0

    // Atomic transaction
    const result = await db.transaction(async (tx) => {
      // 1. Lock and validate products
      const productIds = body.items.map((i) => i.productId)
      const lockedProducts = await tx
        .select()
        .from(products)
        .where(inArray(products.id, productIds))
        .for('update')

      const productMap = new Map(lockedProducts.map((p) => [p.id, p]))

      // Validate all products exist and have stock
      for (const item of body.items) {
        const product = productMap.get(item.productId)
        if (!product) throw new NotFound(`Product ${item.productId} not found`)
        if (!product.isActive) throw new BadRequest(`Product "${product.name}" is inactive`)
        const discountError = getLineDiscountError(product.price, item.discount ?? 0, product.name)
        if (discountError) throw new BadRequest(discountError)
        if (product.trackStock && !product.allowNegativeStock && product.stock < item.qty) {
          throw new BadRequest(`Insufficient stock for "${product.name}": have ${product.stock}, need ${item.qty}`)
        }
      }

      // 2. Calculate totals (server-side, ignore client totals)
      let subtotal = 0
      const saleItemValues = body.items.map((item) => {
        const product = productMap.get(item.productId)!
        const discount = item.discount ?? 0
        const itemSubtotal = lineSubtotal(product.price, item.qty, discount)
        subtotal += itemSubtotal
        return {
          productId: item.productId,
          productNameSnapshot: product.name,
          qty: item.qty,
          price: product.price,
          discount,
          subtotal: itemSubtotal,
        }
      })

      const discountTotal = body.items.reduce((sum, item) => sum + (item.discount ?? 0) * item.qty, 0)
      const taxTotal = taxEnabled ? Math.round(subtotal * taxRate / 100) : 0
      const grandTotal = subtotal + taxTotal
      const paidTotal = body.payments.reduce((sum, p) => sum + p.amount, 0)

      if (paidTotal < grandTotal) {
        throw new BadRequest(`Insufficient payment: need ${grandTotal}, got ${paidTotal}`)
      }

      const changeTotal = paidTotal - grandTotal
      const invoiceNo = generateInvoiceNo()

      // 3. Insert sale
      const [sale] = await tx.insert(sales).values({
        invoiceNo,
        cashierId: request.user.id,
        shiftId: shift.id,
        subtotal,
        discountTotal,
        taxTotal,
        grandTotal,
        paidTotal,
        changeTotal,
        status: 'paid',
      }).returning()

      // 4. Insert sale items
      const insertedItems = await tx.insert(saleItems).values(
        saleItemValues.map((v) => ({ ...v, saleId: sale!.id })),
      ).returning()

      // 5. Insert payments
      await tx.insert(payments).values(
        body.payments.map((p) => ({
          saleId: sale!.id,
          method: p.method,
          amount: p.amount,
          referenceNo: p.referenceNo ?? null,
        })),
      )

      // 6. Decrement stock + insert stock movements
      for (const item of body.items) {
        const product = productMap.get(item.productId)!
        if (product.trackStock) {
          const newStock = product.stock - item.qty
          await tx
            .update(products)
            .set({ stock: newStock, updatedAt: new Date() })
            .where(eq(products.id, item.productId))

          await tx.insert(stockMovements).values({
            productId: item.productId,
            type: 'sale',
            qtyChange: -item.qty,
            stockBefore: product.stock,
            stockAfter: newStock,
            referenceType: 'sale',
            referenceId: sale!.id,
            createdBy: request.user.id,
          })
        }
      }

      // 7. Audit
      await logAudit({
        actorUserId: request.user.id,
        action: 'create_sale',
        entityType: 'sale',
        entityId: sale!.id,
        after: { ...sale, items: insertedItems },
        ipAddress: request.ip,
      }, tx)

      return sale!
    })

    reply.status(201)
    return saleWithDetails(result.id)
  })

  // GET /api/sales
  app.get('/', async (request) => {
    const { page, limit, start, end, status, q } = validateQuery(listQuerySchema, request.query)

    const conditions = []
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

    return {
      data: rows,
      total: totalRows[0]?.total ?? 0,
      page,
      limit,
    }
  })

  // GET /api/sales/:id
  app.get('/:id', async (request) => {
    const id = validateIdParam(request.params)
    return saleWithDetails(id)
  })

  // POST /api/sales/:id/void
  app.post('/:id/void', { preHandler: [requireRole('owner', 'admin')] }, async (request) => {
    const id = validateIdParam(request.params)

    const [sale] = await db.select().from(sales).where(eq(sales.id, id)).limit(1)
    if (!sale) throw new NotFound('Sale not found')
    if (sale.status !== 'paid') throw new BadRequest('Can only void paid sales')

    await db.transaction(async (tx) => {
      // Update sale status
      await tx.update(sales).set({ status: 'void', updatedAt: new Date() }).where(eq(sales.id, id))

      // Restore stock for all items
      const items = await tx.select().from(saleItems).where(eq(saleItems.saleId, id))
      for (const item of items) {
        const [product] = await tx.select().from(products).where(eq(products.id, item.productId)).for('update')
        if (product && product.trackStock) {
          const newStock = product.stock + item.qty
          await tx.update(products).set({ stock: newStock, updatedAt: new Date() }).where(eq(products.id, item.productId))
          await tx.insert(stockMovements).values({
            productId: item.productId,
            type: 'return',
            qtyChange: item.qty,
            stockBefore: product.stock,
            stockAfter: newStock,
            referenceType: 'sale_void',
            referenceId: id,
            createdBy: request.user.id,
          })
        }
      }

      await logAudit({
        actorUserId: request.user.id,
        action: 'void_sale',
        entityType: 'sale',
        entityId: id,
        before: sale,
        after: { ...sale, status: 'void' },
        ipAddress: request.ip,
      }, tx)
    })

    return { message: 'Sale voided' }
  })

  // POST /api/sales/:id/refund
  app.post('/:id/refund', { preHandler: [requireRole('owner', 'admin')] }, async (request) => {
    const id = validateIdParam(request.params)
    const body = validate(refundSchema, request.body)

    const [sale] = await db.select().from(sales).where(eq(sales.id, id)).limit(1)
    if (!sale) throw new NotFound('Sale not found')
    if (sale.status !== 'paid' && sale.status !== 'partial_refunded') {
      throw new BadRequest('Can only refund paid or partially refunded sales')
    }

    const result = await db.transaction(async (tx) => {
      const saleItemRows = await tx.select().from(saleItems).where(eq(saleItems.saleId, id))
      const saleItemMap = new Map(saleItemRows.map((si) => [si.id, si]))

      const existingRefunds = await tx.select().from(refunds).where(eq(refunds.saleId, id))
      const totalRefundedQty = new Map<string, number>()
      for (const er of existingRefunds) {
        const items = await tx.select().from(refundItems).where(eq(refundItems.refundId, er.id))
        for (const item of items) {
          totalRefundedQty.set(item.saleItemId, (totalRefundedQty.get(item.saleItemId) ?? 0) + item.qty)
        }
      }

      // Validate refund items
      const refundItemValues = body.items.map((ri) => {
        const saleItem = saleItemMap.get(ri.saleItemId)
        if (!saleItem) throw new NotFound(`Sale item ${ri.saleItemId} not found`)
        const refundError = getRefundQuantityError(saleItem.qty, totalRefundedQty.get(saleItem.id) ?? 0, ri.qty)
        if (refundError) throw new BadRequest(refundError)
        totalRefundedQty.set(saleItem.id, (totalRefundedQty.get(saleItem.id) ?? 0) + ri.qty)
        const amount = Math.round(lineSubtotal(saleItem.price, ri.qty, saleItem.discount))
        return {
          saleItemId: ri.saleItemId,
          productId: saleItem.productId,
          qty: ri.qty,
          amount,
        }
      })

      // Create refund
      const [refund] = await tx.insert(refunds).values({
        saleId: id,
        reason: body.reason,
        refundedBy: request.user.id,
      }).returning()

      // Create refund items
      await tx.insert(refundItems).values(
        refundItemValues.map((v) => ({ ...v, refundId: refund!.id })),
      )

      // Restore stock
      for (const ri of refundItemValues) {
        const [product] = await tx.select().from(products).where(eq(products.id, ri.productId)).for('update')
        if (product && product.trackStock) {
          const newStock = product.stock + ri.qty
          await tx.update(products).set({ stock: newStock, updatedAt: new Date() }).where(eq(products.id, ri.productId))
          await tx.insert(stockMovements).values({
            productId: ri.productId,
            type: 'refund',
            qtyChange: ri.qty,
            stockBefore: product.stock,
            stockAfter: newStock,
            referenceType: 'refund',
            referenceId: refund!.id,
            createdBy: request.user.id,
          })
        }
      }

      // Check if full or partial refund
      const isFullRefund = saleItemRows.every(
        (si) => (totalRefundedQty.get(si.id) ?? 0) >= si.qty,
      )

      const newStatus = isFullRefund ? 'refunded' : 'partial_refunded'
      await tx.update(sales).set({ status: newStatus, updatedAt: new Date() }).where(eq(sales.id, id))

      await logAudit({
        actorUserId: request.user.id,
        action: 'refund_sale',
        entityType: 'sale',
        entityId: id,
        after: { refundId: refund!.id, items: refundItemValues, newStatus },
        ipAddress: request.ip,
      }, tx)

      return { refundId: refund!.id, status: newStatus }
    })

    return result
  })
}
