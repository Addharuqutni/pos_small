import type { FastifyInstance } from 'fastify'
import { desc, eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client.js'
import { auditLogs, users } from '../db/schema.js'
import { paginationSchema, validateQuery } from '../lib/query-validation.js'
import { requireAuth, requireRole } from '../lib/auth.js'

const listQuerySchema = paginationSchema.extend({
  entityType: z.string().trim().optional(),
  entityId: z.string().trim().optional(),
})

/**
 * Audit log query endpoint — owner/admin only.
 * PRD §15: admins should be able to review the audit trail.
 */
export async function auditRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth)
  app.addHook('preHandler', requireRole('owner', 'admin'))

  // GET /api/audit
  app.get('/', async (request) => {
    const { page, limit, entityType, entityId } = validateQuery(listQuerySchema, request.query)
    const offset = (page - 1) * limit

    const conditions = []
    if (entityType) conditions.push(eq(auditLogs.entityType, entityType))
    if (entityId) conditions.push(eq(auditLogs.entityId, entityId))
    const where = conditions.length > 0 ? and(...conditions) : undefined

    const rows = await db
      .select({
        id: auditLogs.id,
        actorUserId: auditLogs.actorUserId,
        actorName: users.name,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        beforeJson: auditLogs.beforeJson,
        afterJson: auditLogs.afterJson,
        ipAddress: auditLogs.ipAddress,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorUserId, users.id))
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset)

    return { data: rows, page, limit }
  })
}
