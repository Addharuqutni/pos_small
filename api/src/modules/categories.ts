import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client.js'
import { categories } from '../db/schema.js'
import { validate, validateIdParam } from '../lib/validation.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { logAudit } from '../lib/audit.js'
import { NotFound } from '../lib/errors.js'

const createSchema = z.object({
  name: z.string().min(1).max(255),
})

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  isActive: z.boolean().optional(),
})

export async function categoryRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth)

  // GET /api/categories
  app.get('/', async () => {
    return db.select().from(categories).orderBy(categories.name)
  })

  // POST /api/categories
  app.post('/', { preHandler: [requireRole('owner', 'admin')] }, async (request, reply) => {
    const data = validate(createSchema, request.body)
    const [cat] = await db.insert(categories).values(data).returning()

    await logAudit({
      actorUserId: request.user.id,
      action: 'create',
      entityType: 'category',
      entityId: cat!.id,
      after: cat!,
      ipAddress: request.ip,
    })

    reply.status(201)
    return cat!
  })

  // PATCH /api/categories/:id
  app.patch('/:id', { preHandler: [requireRole('owner', 'admin')] }, async (request) => {
    const id = validateIdParam(request.params)
    const data = validate(updateSchema, request.body)

    const [before] = await db.select().from(categories).where(eq(categories.id, id)).limit(1)
    if (!before) throw new NotFound('Category not found')

    const [updated] = await db
      .update(categories)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(categories.id, id))
      .returning()

    await logAudit({
      actorUserId: request.user.id,
      action: 'update',
      entityType: 'category',
      entityId: id,
      before,
      after: updated,
      ipAddress: request.ip,
    })

    return updated
  })
}
