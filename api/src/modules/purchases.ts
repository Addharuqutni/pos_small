import type { FastifyInstance } from 'fastify'
import { eq, inArray, desc } from 'drizzle-orm'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { db } from '../db/client.js'
import {
  purchases, purchaseItems, suppliers, products, stockMovements, users,
} from '../db/schema.js'
import { validate, validateIdParam } from '../lib/validation.js'
import { paginationSchema, validateQuery } from '../lib/query-validation.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { logAudit } from '../lib/audit.js'
import { NotFound } from '../lib/errors.js'

const createSchema = z.object({
  supplierId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
  items: z.array(
    z.object({
      productId: z.string().uuid(),
      qty: z.number().int().min(1),
      costPrice: z.number().int().min(0),
    }),
  ).min(1),
})

const listQuerySchema = paginationSchema

function generateInvoiceNo(): string {
  const now = new Date()
  const date = now.toISOString().slice(0, 10).replace(/-/g, '')
  return `PO-${date}-${nanoid(6).toUpperCase()}`
}

export async function purchaseRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth)

  // GET /api/purchases
  app.get('/', async (request) => {
    const { page, limit } = validateQuery(listQuerySchema, request.query)
    const offset = (page! - 1) * limit!

    const rows = await db
      .select({
        id: purchases.id,
        invoiceNo: purchases.invoiceNo,
        supplierId: purchases.supplierId,
        supplierName: suppliers.name,
        totalCost: purchases.totalCost,
        notes: purchases.notes,
        createdBy: purchases.createdBy,
        createdByName: users.name,
        createdAt: purchases.createdAt,
      })
      .from(purchases)
      .leftJoin(suppliers, eq(purchases.supplierId, suppliers.id))
      .leftJoin(users, eq(purchases.createdBy, users.id))
      .orderBy(desc(purchases.createdAt))
      .limit(limit!)
      .offset(offset)

    return rows
  })

  // GET /api/purchases/:id
  app.get('/:id', async (request) => {
    const id = validateIdParam(request.params)

    const [purchase] = await db.select().from(purchases).where(eq(purchases.id, id)).limit(1)
    if (!purchase) throw new NotFound('Pembelian tidak ditemukan')

    const items = await db.select().from(purchaseItems).where(eq(purchaseItems.purchaseId, id))

    return { ...purchase, items }
  })

  // POST /api/purchases — atomic stock-in
  app.post('/', { preHandler: [requireRole('owner', 'admin')] }, async (request, reply) => {
    const data = validate(createSchema, request.body)

    if (data.supplierId) {
      const [supplier] = await db.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.id, data.supplierId)).limit(1)
      if (!supplier) throw new NotFound('Supplier tidak ditemukan')
    }

    const result = await db.transaction(async (tx) => {
      const productIds = data.items.map((i) => i.productId)
      const lockedProducts = await tx
        .select()
        .from(products)
        .where(inArray(products.id, productIds))
        .for('update')

      const productMap = new Map(lockedProducts.map((p) => [p.id, p]))
      for (const item of data.items) {
        if (!productMap.has(item.productId)) throw new NotFound(`Produk ${item.productId} tidak ditemukan`)
      }

      const itemValues = data.items.map((item) => {
        const product = productMap.get(item.productId)!
        return {
          productId: item.productId,
          productNameSnapshot: product.name,
          qty: item.qty,
          costPrice: item.costPrice,
          subtotal: item.qty * item.costPrice,
        }
      })

      const totalCost = itemValues.reduce((sum, v) => sum + v.subtotal, 0)

      const [purchase] = await tx
        .insert(purchases)
        .values({
          invoiceNo: generateInvoiceNo(),
          supplierId: data.supplierId ?? null,
          totalCost,
          notes: data.notes ?? null,
          createdBy: request.user.id,
        })
        .returning()

      await tx.insert(purchaseItems).values(
        itemValues.map((v) => ({ ...v, purchaseId: purchase!.id })),
      )

      // Increment stock + record movement + update cost price
      for (const item of data.items) {
        const product = productMap.get(item.productId)!
        const newStock = product.stock + item.qty
        await tx.update(products).set({
          stock: newStock,
          costPrice: item.costPrice,
          updatedAt: new Date(),
        }).where(eq(products.id, item.productId))

        await tx.insert(stockMovements).values({
          productId: item.productId,
          type: 'restock',
          qtyChange: item.qty,
          stockBefore: product.stock,
          stockAfter: newStock,
          referenceType: 'purchase',
          referenceId: purchase!.id,
          notes: `PO ${purchase!.invoiceNo}`,
          createdBy: request.user.id,
        })
      }

      await logAudit({
        actorUserId: request.user.id,
        action: 'purchase',
        entityType: 'purchase',
        entityId: purchase!.id,
        after: { invoiceNo: purchase!.invoiceNo, totalCost, items: itemValues },
        ipAddress: request.ip,
      }, tx)

      return purchase!
    })

    reply.status(201)
    return result
  })
}
