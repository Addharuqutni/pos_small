import type { FastifyInstance } from 'fastify'
import { eq, and, or, lte, gte, isNull, desc } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client.js'
import { promos } from '../db/schema.js'
import { validate, validateIdParam } from '../lib/validation.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { logAudit } from '../lib/audit.js'
import { NotFound } from '../lib/errors.js'
import { computePromoDiscount } from '../lib/sales-rules.js'

const createSchema = z.object({
  code: z.string().min(1).max(50).transform((v) => v.trim().toUpperCase()),
  name: z.string().min(1).max(255),
  type: z.enum(['percent', 'amount']),
  value: z.number().int().min(0),
  minPurchase: z.number().int().min(0).optional(),
  maxDiscount: z.number().int().min(0).nullable().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  usageLimit: z.number().int().min(0).nullable().optional(),
})

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  type: z.enum(['percent', 'amount']).optional(),
  value: z.number().int().min(0).optional(),
  minPurchase: z.number().int().min(0).optional(),
  maxDiscount: z.number().int().min(0).nullable().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  usageLimit: z.number().int().min(0).nullable().optional(),
  isActive: z.boolean().optional(),
})

const validateQuerySchema = z.object({
  code: z.string().min(1).max(50).transform((v) => v.trim().toUpperCase()),
  subtotal: z.coerce.number().int().min(0),
})

export async function promoRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth)

  // GET /api/promos/validate?code=&subtotal= — cashier-facing, no role restriction
  app.get('/validate', async (request) => {
    const { code, subtotal } = validate(validateQuerySchema, request.query)

    const now = new Date()
    const [promo] = await db
      .select()
      .from(promos)
      .where(
        and(
          eq(promos.code, code),
          eq(promos.isActive, true),
          lte(promos.startsAt, now),
          or(isNull(promos.endsAt), gte(promos.endsAt, now)),
        ),
      )
      .limit(1)

    if (!promo) throw new NotFound('Promo tidak ditemukan atau sudah tidak berlaku')
    if (promo.usageLimit != null && promo.usageCount >= promo.usageLimit) {
      throw new NotFound('Promo sudah mencapai batas pemakaian')
    }
    if (subtotal < promo.minPurchase) {
      throw new NotFound(`Minimal belanja untuk promo ini ${promo.minPurchase}`)
    }

    const discount = computePromoDiscount(promo.type, promo.value, subtotal, promo.maxDiscount)

    return {
      id: promo.id,
      code: promo.code,
      name: promo.name,
      type: promo.type,
      value: promo.value,
      maxDiscount: promo.maxDiscount,
      discount,
    }
  })

  // GET /api/promos — owner/admin
  app.get('/', { preHandler: [requireRole('owner', 'admin')] }, async () => {
    return db.select().from(promos).orderBy(desc(promos.createdAt))
  })

  // POST /api/promos
  app.post('/', { preHandler: [requireRole('owner', 'admin')] }, async (request, reply) => {
    const data = validate(createSchema, request.body)

    const [existing] = await db.select({ id: promos.id }).from(promos).where(eq(promos.code, data.code)).limit(1)
    if (existing) throw new NotFound('Kode promo sudah dipakai')

    const [promo] = await db
      .insert(promos)
      .values({
        code: data.code,
        name: data.name,
        type: data.type,
        value: data.value,
        minPurchase: data.minPurchase ?? 0,
        maxDiscount: data.maxDiscount ?? null,
        startsAt: data.startsAt ? new Date(data.startsAt) : new Date(),
        endsAt: data.endsAt ? new Date(data.endsAt) : null,
        usageLimit: data.usageLimit ?? null,
      })
      .returning()

    await logAudit({
      actorUserId: request.user.id,
      action: 'create',
      entityType: 'promo',
      entityId: promo!.id,
      after: promo!,
      ipAddress: request.ip,
    })

    reply.status(201)
    return promo!
  })

  // PATCH /api/promos/:id
  app.patch('/:id', { preHandler: [requireRole('owner', 'admin')] }, async (request) => {
    const id = validateIdParam(request.params)
    const data = validate(updateSchema, request.body)

    const [before] = await db.select().from(promos).where(eq(promos.id, id)).limit(1)
    if (!before) throw new NotFound('Promo tidak ditemukan')

    const [updated] = await db
      .update(promos)
      .set({
        ...data,
        startsAt: data.startsAt ? new Date(data.startsAt) : undefined,
        endsAt: data.endsAt === null ? null : data.endsAt ? new Date(data.endsAt) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(promos.id, id))
      .returning()

    await logAudit({
      actorUserId: request.user.id,
      action: 'update',
      entityType: 'promo',
      entityId: id,
      before,
      after: updated,
      ipAddress: request.ip,
    })

    return updated
  })
}
