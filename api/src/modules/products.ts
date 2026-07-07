import type { FastifyInstance } from 'fastify'
import { eq, and, ilike, or, count, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client.js'
import { products, categories } from '../db/schema.js'
import { validate, validateIdParam } from '../lib/validation.js'
import { escapeLikePattern, validateQuery, booleanParamSchema, paginationSchema } from '../lib/query-validation.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { logAudit } from '../lib/audit.js'
import { NotFound } from '../lib/errors.js'

// ~1.5MB base64 ceiling — guards against oversized image uploads stored in TEXT.
const MAX_IMAGE_DATA_LENGTH = 2_000_000

const createSchema = z.object({
  name: z.string().min(1).max(255),
  sku: z.string().max(100).nullable().optional(),
  barcode: z.string().max(100).nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  imageData: z.string().max(MAX_IMAGE_DATA_LENGTH).nullable().optional(),
  price: z.number().int().min(0),
  costPrice: z.number().int().min(0).optional(),
  stock: z.number().int().min(0).optional(),
  minStock: z.number().int().min(0).optional(),
  trackStock: z.boolean().optional(),
  allowNegativeStock: z.boolean().optional(),
})

const updateSchema = createSchema.partial().extend({
  isActive: z.boolean().optional(),
})

const listQuerySchema = paginationSchema.merge(booleanParamSchema).extend({
  search: z.string().trim().max(100).optional(),
  category: z.string().uuid().optional(),
})

export async function productRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth)

  // GET /api/products
  app.get('/', async (request) => {
    const { page, limit, search, category, active } = validateQuery(listQuerySchema, request.query)

    const conditions = []
    if (active !== undefined) {
      conditions.push(eq(products.isActive, active as boolean))
    }
    if (category) {
      conditions.push(eq(products.categoryId, category))
    }
    if (search) {
      // Escape LIKE wildcards so user input is matched literally.
      const pattern = `%${escapeLikePattern(search)}%`
      conditions.push(
        or(
          ilike(products.name, pattern),
          ilike(products.sku, pattern),
          ilike(products.barcode, pattern),
        )!,
      )
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined
    const offset = (page! - 1) * limit!

    const [rows, totalRows] = await Promise.all([
      db
        .select({
          id: products.id,
          name: products.name,
          sku: products.sku,
          barcode: products.barcode,
          categoryId: products.categoryId,
          categoryName: categories.name,
          price: products.price,
          costPrice: products.costPrice,
          stock: products.stock,
          minStock: products.minStock,
          trackStock: products.trackStock,
          allowNegativeStock: products.allowNegativeStock,
          isActive: products.isActive,
          createdAt: products.createdAt,
          updatedAt: products.updatedAt,
          // NOTE: imageData intentionally omitted from list responses to keep
          // payloads small; fetch via GET /api/products/:id when needed.
          hasImage: sql<boolean>`${products.imageData} IS NOT NULL`.as('hasImage'),
        })
        .from(products)
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .where(where)
        .orderBy(products.name)
        .limit(limit!)
        .offset(offset),
      db.select({ total: count() }).from(products).where(where),
    ])

    return { data: rows, total: totalRows[0]?.total ?? 0, page, limit }
  })

  // GET /api/products/:id
  app.get('/:id', async (request) => {
    const id = validateIdParam(request.params)
    const [product] = await db
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        barcode: products.barcode,
        categoryId: products.categoryId,
        categoryName: categories.name,
        imageData: products.imageData,
        price: products.price,
        costPrice: products.costPrice,
        stock: products.stock,
        minStock: products.minStock,
        trackStock: products.trackStock,
        allowNegativeStock: products.allowNegativeStock,
        isActive: products.isActive,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(eq(products.id, id))
      .limit(1)

    if (!product) throw new NotFound('Product not found')
    return product!
  })

  // POST /api/products
  app.post('/', { preHandler: [requireRole('owner', 'admin')] }, async (request, reply) => {
    const data = validate(createSchema, request.body)
    const [product] = await db.insert(products).values({
      ...data,
      sku: data.sku || null,
      barcode: data.barcode || null,
    }).returning()

    await logAudit({
      actorUserId: request.user.id,
      action: 'create',
      entityType: 'product',
      entityId: product!.id,
      after: product!,
      ipAddress: request.ip,
    })

    reply.status(201)
    return product!
  })

  // PATCH /api/products/:id
  app.patch('/:id', { preHandler: [requireRole('owner', 'admin')] }, async (request) => {
    const id = validateIdParam(request.params)
    const data = validate(updateSchema, request.body)

    const [before] = await db.select().from(products).where(eq(products.id, id)).limit(1)
    if (!before) throw new NotFound('Product not found')

    const updates: Record<string, unknown> = { ...data, updatedAt: new Date() }
    if ('sku' in data) updates.sku = data.sku || null
    if ('barcode' in data) updates.barcode = data.barcode || null

    const [updated] = await db
      .update(products)
      .set(updates)
      .where(eq(products.id, id))
      .returning()

    await logAudit({
      actorUserId: request.user.id,
      action: 'update',
      entityType: 'product',
      entityId: id,
      before,
      after: updated,
      ipAddress: request.ip,
    })

    return updated
  })
}
