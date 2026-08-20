import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client.js'
import { suppliers } from '../db/schema.js'
import { validate, validateIdParam } from '../lib/validation.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { logAudit } from '../lib/audit.js'
import { NotFound } from '../lib/errors.js'

const createSchema = z.object({
  name: z.string().min(1).max(255),
  phone: z.string().max(50).nullable().optional(),
  address: z.string().nullable().optional(),
})

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  phone: z.string().max(50).nullable().optional(),
  address: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
})

export async function supplierRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth)

  // GET /api/suppliers
  app.get('/', async () => {
    return db.select().from(suppliers).orderBy(suppliers.name)
  })

  // POST /api/suppliers
  app.post('/', { preHandler: [requireRole('owner', 'admin')] }, async (request, reply) => {
    const data = validate(createSchema, request.body)

    const [supplier] = await db
      .insert(suppliers)
      .values({
        name: data.name,
        phone: data.phone ?? null,
        address: data.address ?? null,
      })
      .returning()

    await logAudit({
      actorUserId: request.user.id,
      action: 'create',
      entityType: 'supplier',
      entityId: supplier!.id,
      after: supplier!,
      ipAddress: request.ip,
    })

    reply.status(201)
    return supplier!
  })

  // PATCH /api/suppliers/:id
  app.patch('/:id', { preHandler: [requireRole('owner', 'admin')] }, async (request) => {
    const id = validateIdParam(request.params)
    const data = validate(updateSchema, request.body)

    const [before] = await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1)
    if (!before) throw new NotFound('Supplier tidak ditemukan')

    const [updated] = await db
      .update(suppliers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(suppliers.id, id))
      .returning()

    await logAudit({
      actorUserId: request.user.id,
      action: 'update',
      entityType: 'supplier',
      entityId: id,
      before,
      after: updated,
      ipAddress: request.ip,
    })

    return updated
  })
}
