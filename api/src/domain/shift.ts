import { eq, and, desc, ne, inArray, sql } from 'drizzle-orm'
import type { Db } from '../db/types.js'
import { shifts, sales, payments, refunds, refundItems } from '../db/schema.js'
import { logAudit } from '../lib/audit.js'
import { NotFound, Conflict } from '../lib/errors.js'

export interface ShiftActor {
  id: string
  role: 'owner' | 'admin' | 'cashier'
  /** Client IP, recorded on audit rows. */
  ipAddress?: string
}

export interface OpenShiftInput {
  openingCash: number
}

export interface CloseShiftInput {
  closingCash: number
}

export type ShiftRow = typeof shifts.$inferSelect

/**
 * The cashier's open shift, or null. Accepts the db handle or a tx so callers
 * can read it inside a transaction (checkout does). Pass `lock` to take a
 * FOR UPDATE lock on the row, serialising it against close/checkout.
 */
export async function currentShiftFor(dbOrTx: Db, cashierId: string, opts?: { lock?: boolean }): Promise<ShiftRow | null> {
  const query = dbOrTx
    .select()
    .from(shifts)
    .where(and(eq(shifts.cashierId, cashierId), eq(shifts.status, 'open')))
    .orderBy(desc(shifts.openedAt))
    .limit(1)

  const [shift] = opts?.lock ? await query.for('update') : await query
  return shift ?? null
}

/** Opens a shift; one open shift per cashier is enforced under lock. */
export async function openShift(db: Db, actor: ShiftActor, input: OpenShiftInput): Promise<ShiftRow> {
  return db.transaction(async (tx) => {
    // Lock any existing open shift for this cashier
    const [existing] = await tx
      .select({ id: shifts.id })
      .from(shifts)
      .where(and(eq(shifts.cashierId, actor.id), eq(shifts.status, 'open')))
      .for('update')
      .limit(1)

    if (existing) throw new Conflict('Anda masih memiliki shift yang terbuka')

    const [created] = await tx
      .insert(shifts)
      .values({ cashierId: actor.id, openingCash: input.openingCash })
      .returning()

    await logAudit({
      actorUserId: actor.id,
      action: 'open_shift',
      entityType: 'shift',
      entityId: created!.id,
      after: created!,
      ipAddress: actor.ipAddress,
    }, tx)

    return created!
  })
}

/** Expected cash for a shift: opening + cash sales (non-void) − cash refunds. */
export async function computeExpectedCash(dbOrTx: Db, shift: ShiftRow): Promise<number> {
  // Calculate expected cash: opening + cash payments - cash refunds during shift
  const shiftSalesPayments = await dbOrTx
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
    const refundRows = await dbOrTx
      .select({ id: refunds.id })
      .from(refunds)
      .where(inArray(refunds.saleId, cashSaleIds))
    const refundIds = refundRows.map((r) => r.id)
    if (refundIds.length > 0) {
      const refundItemRows = await dbOrTx
        .select({ amount: refundItems.amount })
        .from(refundItems)
        .where(inArray(refundItems.refundId, refundIds))
      cashRefundTotal = refundItemRows.reduce((sum, item) => sum + item.amount, 0)
    }
  }

  return shift.openingCash + cashSalesTotal - cashRefundTotal
}

/**
 * Closes the cashier's open shift (latest wins; any stale duplicate open rows are
 * closed flat) and writes the audit row in the same transaction.
 */
export async function closeShift(db: Db, actor: ShiftActor, input: CloseShiftInput): Promise<ShiftRow> {
  return db.transaction(async (tx) => {
    // Lock all open shift rows; old DBs may already contain duplicate open shifts.
    const openShifts = await tx
      .select()
      .from(shifts)
      .where(and(eq(shifts.cashierId, actor.id), eq(shifts.status, 'open')))
      .orderBy(desc(shifts.openedAt))
      .for('update')

    const [shift, ...staleOpenShifts] = openShifts
    if (!shift) throw new NotFound('Tidak ada shift aktif untuk ditutup')

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

    const expectedCash = await computeExpectedCash(tx, shift)
    const difference = input.closingCash - expectedCash

    const [updated] = await tx
      .update(shifts)
      .set({
        status: 'closed',
        closedAt: new Date(),
        closingCash: input.closingCash,
        expectedCash,
        difference,
      })
      .where(eq(shifts.id, shift.id))
      .returning()

    await logAudit({
      actorUserId: actor.id,
      action: 'close_shift',
      entityType: 'shift',
      entityId: shift.id,
      before: shift,
      after: updated,
      ipAddress: actor.ipAddress,
    }, tx)

    return updated!
  })
}

/** Paginated shift list, scoped to what the actor may see. */
export async function listShifts(db: Db, actor: Pick<ShiftActor, 'id' | 'role'>, params: { page: number; limit: number }) {
  const where = actor.role === 'cashier' ? eq(shifts.cashierId, actor.id) : undefined

  return db
    .select()
    .from(shifts)
    .where(where)
    .orderBy(desc(shifts.openedAt))
    .limit(params.limit)
    .offset((params.page - 1) * params.limit)
}
