import type { FastifyInstance } from 'fastify'
import { eq, desc, and, count } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client.js'
import { stockMovements, products } from '../db/schema.js'
import { validate } from '../lib/validation.js'
import { paginationSchema, validateQuery } from '../lib/query-validation.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { logAudit } from '../lib/audit.js'
import { NotFound, BadRequest } from '../lib/errors.js'

const adjustmentSchema = z.object({
  productId: z.string().uuid(),
  qtyChange: z.number().int(),
  type: z.enum(['adjustment', 'restock']),
  notes: z.string().optional(),
})

const listQuerySchema = paginationSchema.extend({
  productId: z.string().uuid().optional(),
})

export async function stockRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth)

  // GET /api/stock/movements
  app.get('/movements', async (request) => {
    const { page, limit, productId } = validateQuery(listQuerySchema, request.query)

    const conditions = []
    if (productId) conditions.push(eq(stockMovements.productId, productId))

    const where = conditions.length > 0 ? and(...conditions) : undefined
    const offset = (page! - 1) * limit!

    const [rows, totalRows] = await Promise.all([
      db
        .select({
          id: stockMovements.id,
          productId: stockMovements.productId,
          productName: products.name,
          type: stockMovements.type,
          qtyChange: stockMovements.qtyChange,
          stockBefore: stockMovements.stockBefore,
          stockAfter: stockMovements.stockAfter,
          referenceType: stockMovements.referenceType,
          referenceId: stockMovements.referenceId,
          notes: stockMovements.notes,
          createdBy: stockMovements.createdBy,
          createdAt: stockMovements.createdAt,
        })
        .from(stockMovements)
        .leftJoin(products, eq(stockMovements.productId, products.id))
        .where(where)
        .orderBy(desc(stockMovements.createdAt))
        .limit(limit!)
        .offset(offset),
      db.select({ total: count() }).from(stockMovements).where(where),
    ])

    return {
      data: rows,
      total: totalRows[0]?.total ?? 0,
      page,
      limit,
    }
  })

  // POST /api/stock/adjust
  app.post('/adjust', { preHandler: [requireRole('owner', 'admin')] }, async (request, reply) => {
    const data = validate(adjustmentSchema, request.body)

    const result = await db.transaction(async (tx) => {
      const [product] = await tx
        .select()
        .from(products)
        .where(eq(products.id, data.productId))
        .for('update')

      if (!product) throw new NotFound('Product not found')

      const newStock = product.stock + data.qtyChange
      // Honor the product's negative-stock policy — a manual adjustment must
      // not push tracked products below zero unless explicitly allowed.
      if (
        product.trackStock &&
        !product.allowNegativeStock &&
        data.type === 'adjustment' &&
        newStock < 0
      ) {
        throw new BadRequest(
          `Stok tidak boleh negatif untuk "${product.name}" (akan menjadi ${newStock})`,
        )
      }
      await tx
        .update(products)
        .set({ stock: newStock, updatedAt: new Date() })
        .where(eq(products.id, data.productId))

      const [movement] = await tx.insert(stockMovements).values({
        productId: data.productId,
        type: data.type,
        qtyChange: data.qtyChange,
        stockBefore: product.stock,
        stockAfter: newStock,
        notes: data.notes ?? null,
        createdBy: request.user.id,
      }).returning()

      await logAudit({
        actorUserId: request.user.id,
        action: 'stock_adjustment',
        entityType: 'product',
        entityId: data.productId,
        before: { stock: product.stock },
        after: { stock: newStock },
        ipAddress: request.ip,
      }, tx)

      return movement
    })

    reply.status(201)
    return result
  })
}
