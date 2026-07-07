import type { FastifyInstance } from 'fastify'
import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client.js'
import { settings } from '../db/schema.js'
import { validate } from '../lib/validation.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { logAudit } from '../lib/audit.js'

const updateSchema = z.object({
  storeName: z.string().min(1).max(255).optional(),
  storeAddress: z.string().optional(),
  storePhone: z.string().max(50).optional(),
  receiptFooter: z.string().optional(),
  taxEnabled: z.boolean().optional(),
  taxRate: z.number().int().min(0).max(100).optional(),
  currency: z.string().max(10).optional(),
  allowNegativeStockDefault: z.boolean().optional(),
})

// Stable lock key for the settings singleton (pg_advisory_xact_lock accepts bigint).
const SETTINGS_LOCK_KEY = 9_876_543_210

/**
 * Read the singleton settings row. The advisory lock + transaction is only
 * needed for the (rare) first-time creation; subsequent reads skip it.
 */
async function getSettings() {
  const [row] = await db.select().from(settings).limit(1)
  if (row) return row

  // First-time creation — serialize concurrent creators with an advisory lock.
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${SETTINGS_LOCK_KEY})`)
    const [existing] = await tx.select().from(settings).limit(1)
    if (existing) return existing
    const [created] = await tx.insert(settings).values({}).returning()
    return created!
  })
}

export async function settingsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth)

  // GET /api/settings
  app.get('/', async () => {
    return getSettings()
  })

  // PATCH /api/settings — read + update inside the same transaction so a
  // concurrent PATCH cannot silently overwrite the other's changes.
  app.patch('/', { preHandler: [requireRole('owner', 'admin')] }, async (request) => {
    const data = validate(updateSchema, request.body)

    const updated = await db.transaction(async (tx) => {
      // Serialize settings mutations — only one PATCH at a time.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${SETTINGS_LOCK_KEY})`)

      const [before] = await tx.select().from(settings).limit(1)
      if (!before) throw new Error('Settings row missing — run seed first')

      const [row] = await tx
        .update(settings)
        .set(data)
        .where(eq(settings.id, before.id))
        .returning()

      await logAudit({
        actorUserId: request.user.id,
        action: 'update',
        entityType: 'settings',
        entityId: before.id,
        before,
        after: row,
        ipAddress: request.ip,
      }, tx)

      return row
    })

    return updated
  })
}
