import type { FastifyInstance } from 'fastify'
import { eq, desc } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client.js'
import { shifts, users } from '../db/schema.js'
import { validate } from '../lib/validation.js'
import { paginationSchema, validateQuery } from '../lib/query-validation.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { NotFound } from '../lib/errors.js'
import { closeShift, currentShiftFor, listShifts, openShift } from '../domain/shift.js'

const openSchema = z.object({
  openingCash: z.number().int().min(0),
})

const closeSchema = z.object({
  closingCash: z.number().int().min(0),
})

const listQuerySchema = paginationSchema

export async function shiftRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth)

  // POST /api/shifts/open — atomic: lock-check-insert to prevent race condition
  app.post('/open', async (request, reply) => {
    const { openingCash } = validate(openSchema, request.body)
    const shift = await openShift(
      db,
      { id: request.user.id, role: request.user.role, ipAddress: request.ip },
      { openingCash },
    )

    reply.status(201)
    return shift
  })

  // GET /api/shifts/active
  app.get('/active', async (request) => {
    const shift = await currentShiftFor(db, request.user.id)
    if (!shift) throw new NotFound('Tidak ada shift aktif')
    return shift
  })

  // POST /api/shifts/close — atomic: FOR UPDATE lock prevents concurrent close corruption
  app.post('/close', async (request) => {
    const { closingCash } = validate(closeSchema, request.body)
    return closeShift(
      db,
      { id: request.user.id, role: request.user.role, ipAddress: request.ip },
      { closingCash },
    )
  })

  // GET /api/shifts/report — owner/admin only
  app.get('/report', { preHandler: [requireRole('owner', 'admin')] }, async () => {
    const rows = await db
      .select({
        id: shifts.id,
        cashierId: shifts.cashierId,
        cashierName: users.name,
        openedAt: shifts.openedAt,
        closedAt: shifts.closedAt,
        openingCash: shifts.openingCash,
        closingCash: shifts.closingCash,
        expectedCash: shifts.expectedCash,
        difference: shifts.difference,
        status: shifts.status,
      })
      .from(shifts)
      .innerJoin(users, eq(shifts.cashierId, users.id))
      .orderBy(desc(shifts.openedAt))

    return rows
  })

  // GET /api/shifts — cashiers see only their own shifts
  app.get('/', async (request) => {
    const { page, limit } = validateQuery(listQuerySchema, request.query)
    return listShifts(db, request.user, { page: page!, limit: limit! })
  })
}
