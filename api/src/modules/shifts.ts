import type { FastifyInstance } from 'fastify'
import { eq, and, desc, ne, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client.js'
import { shifts, sales, payments, users, refunds, refundItems } from '../db/schema.js'
import { validate } from '../lib/validation.js'
import { paginationSchema, validateQuery } from '../lib/query-validation.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { logAudit } from '../lib/audit.js'
import { NotFound, Conflict } from '../lib/errors.js'

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

    const shift = await db.transaction(async (tx) => {
      // Lock any existing open shift for this cashier
      const [existing] = await tx
        .select({ id: shifts.id })
        .from(shifts)
        .where(and(eq(shifts.cashierId, request.user.id), eq(shifts.status, 'open')))
        .for('update')
        .limit(1)

      if (existing) throw new Conflict('You already have an open shift')

      const [created] = await tx
        .insert(shifts)
        .values({ cashierId: request.user.id, openingCash })
        .returning()

      return created!
    })

    await logAudit({
      actorUserId: request.user.id,
      action: 'open_shift',
      entityType: 'shift',
      entityId: shift.id,
      after: shift,
      ipAddress: request.ip,
    })

    reply.status(201)
    return shift
  })

  // GET /api/shifts/active
  app.get('/active', async (request) => {
    const [shift] = await db
      .select()
      .from(shifts)
      .where(and(eq(shifts.cashierId, request.user.id), eq(shifts.status, 'open')))
      .limit(1)

    if (!shift) throw new NotFound('No active shift')
    return shift!
  })

  // POST /api/shifts/close — atomic: FOR UPDATE lock prevents concurrent close corruption
  app.post('/close', async (request) => {
    const { closingCash } = validate(closeSchema, request.body)

    const closed = await db.transaction(async (tx) => {
      // Lock all open shift rows; old DBs may already contain duplicate open shifts.
      const openShifts = await tx
        .select()
        .from(shifts)
        .where(and(eq(shifts.cashierId, request.user.id), eq(shifts.status, 'open')))
        .orderBy(desc(shifts.openedAt))
        .for('update')

      const [shift, ...staleOpenShifts] = openShifts
      if (!shift) throw new NotFound('No active shift to close')

      if (staleOpenShifts.length > 0) {
        await tx
          .update(shifts)
          .set({
            status: 'closed',
            closedAt: new Date(),
            closingCash: sql`${shifts.openingCash}`,
            expectedCash: sql`${shifts.openingCash}`,
            difference: 0,
          })
          .where(inArray(shifts.id, staleOpenShifts.map((s) => s.id)))
      }

      // Calculate expected cash: opening + cash payments - cash refunds during shift
      const shiftSalesPayments = await tx
        .select({ saleId: sales.id, amount: payments.amount })
        .from(payments)
        .innerJoin(sales, eq(payments.saleId, sales.id))
        .where(
          and(
            eq(sales.shiftId, shift.id),
            eq(payments.method, 'cash'),
            ne(sales.status, 'void'),
          ),
        )

      const cashSalesTotal = shiftSalesPayments.reduce((sum, p) => sum + p.amount, 0)
      const cashSaleIds = [...new Set(shiftSalesPayments.map((p) => p.saleId))]
      let cashRefundTotal = 0
      if (cashSaleIds.length > 0) {
        const refundRows = await tx
          .select({ id: refunds.id })
          .from(refunds)
          .where(inArray(refunds.saleId, cashSaleIds))
        const refundIds = refundRows.map((r) => r.id)
        if (refundIds.length > 0) {
          const refundItemRows = await tx
            .select({ amount: refundItems.amount })
            .from(refundItems)
            .where(inArray(refundItems.refundId, refundIds))
          cashRefundTotal = refundItemRows.reduce((sum, item) => sum + item.amount, 0)
        }
      }

      const expectedCash = shift.openingCash + cashSalesTotal - cashRefundTotal
      const difference = closingCash - expectedCash

      const [updated] = await tx
        .update(shifts)
        .set({
          status: 'closed',
          closedAt: new Date(),
          closingCash,
          expectedCash,
          difference,
        })
        .where(eq(shifts.id, shift.id))
        .returning()

      await logAudit({
        actorUserId: request.user.id,
        action: 'close_shift',
        entityType: 'shift',
        entityId: shift.id,
        before: shift,
        after: updated,
        ipAddress: request.ip,
      })

      return updated!
    })

    return closed
  })

  // GET /api/shifts/report — owner/admin only
  app.get('/report', { preHandler: requireRole('owner', 'admin') }, async () => {
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

  // GET /api/shifts
  app.get('/', async (request) => {
    const { page, limit } = validateQuery(listQuerySchema, request.query)
    const offset = (page - 1) * limit

    const rows = await db
      .select()
      .from(shifts)
      .orderBy(desc(shifts.openedAt))
      .limit(limit)
      .offset(offset)

    return rows
  })
}
