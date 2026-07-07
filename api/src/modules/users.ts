import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcrypt'
import { z } from 'zod'
import { db } from '../db/client.js'
import { users } from '../db/schema.js'
import { validate, validateIdParam } from '../lib/validation.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { logAudit } from '../lib/audit.js'
import { NotFound, Conflict } from '../lib/errors.js'

const SALT_ROUNDS = 10

const createSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['admin', 'cashier']),
})

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
  role: z.enum(['admin', 'cashier']).optional(),
  isActive: z.boolean().optional(),
})

const resetPasswordSchema = z.object({
  password: z.string().min(6),
})

export async function userRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth)
  app.addHook('preHandler', requireRole('owner'))

  // GET /api/users
  app.get('/', async () => {
    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .orderBy(users.name)

    return rows
  })

  // POST /api/users
  app.post('/', async (request, reply) => {
    const data = validate(createSchema, request.body)

    // Check duplicate email
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, data.email)).limit(1)
    if (existing) throw new Conflict('Email already exists')

    const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS)
    const [user] = await db
      .insert(users)
      .values({ name: data.name, email: data.email, passwordHash, role: data.role })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
      })

    await logAudit({
      actorUserId: request.user.id,
      action: 'create',
      entityType: 'user',
      entityId: user!.id,
      after: user!,
      ipAddress: request.ip,
    })

    reply.status(201)
    return user!
  })

  // PATCH /api/users/:id
  app.patch('/:id', async (request) => {
    const id = validateIdParam(request.params)
    const data = validate(updateSchema, request.body)

    const [before] = await db
      .select({
        id: users.id, name: users.name, email: users.email,
        role: users.role, isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1)
    if (!before) throw new NotFound('User not found')

    if (data.email && data.email !== before.email) {
      const [dup] = await db.select({ id: users.id }).from(users).where(eq(users.email, data.email)).limit(1)
      if (dup) throw new Conflict('Email already exists')
    }

    const [updated] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning({
        id: users.id, name: users.name, email: users.email,
        role: users.role, isActive: users.isActive, updatedAt: users.updatedAt,
      })

    await logAudit({
      actorUserId: request.user.id,
      action: 'update',
      entityType: 'user',
      entityId: id,
      before,
      after: updated,
      ipAddress: request.ip,
    })

    return updated
  })

  // POST /api/users/:id/reset-password
  app.post('/:id/reset-password', async (request) => {
    const id = validateIdParam(request.params)
    const { password } = validate(resetPasswordSchema, request.body)

    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1)
    if (!user) throw new NotFound('User not found')

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
    await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, id))

    await logAudit({
      actorUserId: request.user.id,
      action: 'reset_password',
      entityType: 'user',
      entityId: id,
      ipAddress: request.ip,
    })

    return { message: 'Password reset' }
  })
}
