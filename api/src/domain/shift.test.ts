import { test, before, after, beforeEach } from 'node:test'
import { strict as assert } from 'node:assert'
import { eq, and } from 'drizzle-orm'
import {
  createTestDb, resetTestDb, createUser, createSettings, createProduct,
  createOpenShift, type TestDb,
} from '../test/pg.js'
import { closeShift, currentShiftFor, openShift, computeExpectedCash } from './shift.js'
import { checkoutSale, refundSale, voidSale } from './sale-ledger.js'
import { auditLogs, saleItems, sales, shifts } from '../db/schema.js'

let ctx: TestDb

function actor(id: string, role: 'owner' | 'admin' | 'cashier' = 'cashier') {
  return { id, role, ipAddress: '127.0.0.1' }
}

before(async () => { ctx = await createTestDb() })
after(async () => { await ctx.close() })
beforeEach(async () => { await resetTestDb(ctx.client) })

test('openShift creates an open shift and audits it inside the transaction', async () => {
  const cashier = await createUser(ctx.db)
  const shift = await openShift(ctx.db, actor(cashier.id), { openingCash: 150_000 })

  assert.equal(shift.status, 'open')
  assert.equal(shift.openingCash, 150_000)
  assert.equal(shift.cashierId, cashier.id)

  const audit = await ctx.db.select().from(auditLogs)
    .where(and(eq(auditLogs.action, 'open_shift'), eq(auditLogs.entityId, shift.id)))
  assert.equal(audit.length, 1)
  assert.equal(audit[0]!.actorUserId, cashier.id)
})

test('openShift conflicts while another shift is open', async () => {
  const cashier = await createUser(ctx.db)
  await openShift(ctx.db, actor(cashier.id), { openingCash: 100_000 })

  await assert.rejects(
    openShift(ctx.db, actor(cashier.id), { openingCash: 50_000 }),
    /Anda masih memiliki shift yang terbuka/,
  )
  assert.equal((await ctx.db.select().from(shifts)).length, 1)
})

test('openShift is per-cashier: another cashier can open concurrently', async () => {
  const a = await createUser(ctx.db, { name: 'A' })
  const b = await createUser(ctx.db, { name: 'B' })
  await openShift(ctx.db, actor(a.id), { openingCash: 10_000 })
  await openShift(ctx.db, actor(b.id), { openingCash: 20_000 })
  assert.equal((await ctx.db.select().from(shifts)).length, 2)
})

test('currentShiftFor returns the cashier open shift or null', async () => {
  const cashier = await createUser(ctx.db)
  assert.equal(await currentShiftFor(ctx.db, cashier.id), null)

  const opened = await openShift(ctx.db, actor(cashier.id), { openingCash: 100_000 })
  const current = await currentShiftFor(ctx.db, cashier.id)
  assert.equal(current?.id, opened.id)

  await closeShift(ctx.db, actor(cashier.id), { closingCash: 100_000 })
  assert.equal(await currentShiftFor(ctx.db, cashier.id), null)
})

test('closeShift computes expectedCash = opening + cash sales − cash refunds', async () => {
  const cashier = await createUser(ctx.db)
  await createSettings(ctx.db, { taxEnabled: false, taxRate: 0 })
  const product = await createProduct(ctx.db, { price: 10_000, stock: 50 })
  await openShift(ctx.db, actor(cashier.id), { openingCash: 100_000 })

  // Cash sale 30 000; QRIS sale 20 000 (excluded); then refund 10 000 of the cash sale.
  const { saleId } = await checkoutSale(ctx.db, actor(cashier.id), {
    items: [{ productId: product.id, qty: 3 }],
    payments: [{ method: 'cash', amount: 30_000 }],
  })
  await checkoutSale(ctx.db, actor(cashier.id), {
    items: [{ productId: product.id, qty: 2 }],
    payments: [{ method: 'qris', amount: 20_000 }],
  })
  const [cashItem] = await ctx.db.select().from(saleItems).where(eq(saleItems.saleId, saleId))
  await refundSale(ctx.db, actor(cashier.id), saleId, {
    reason: 'Rusak', items: [{ saleItemId: cashItem!.id, qty: 1 }],
  })

  const closed = await closeShift(ctx.db, actor(cashier.id), { closingCash: 120_000 })
  // 100 000 + 30 000 − 10 000 = 120 000
  assert.equal(closed.expectedCash, 120_000)
  assert.equal(closed.difference, 0)
  assert.equal(closed.status, 'closed')
})

test('expectedCash nets out change handed back on a cash overpayment', async () => {
  const cashier = await createUser(ctx.db)
  await createSettings(ctx.db, { taxEnabled: false, taxRate: 0 })
  const product = await createProduct(ctx.db, { price: 47_500, stock: 10 })
  await openShift(ctx.db, actor(cashier.id), { openingCash: 0 })

  // Customer hands over 50 000 for a 47 500 total: 2 500 leaves the drawer again.
  const { saleId } = await checkoutSale(ctx.db, actor(cashier.id), {
    items: [{ productId: product.id, qty: 1 }],
    payments: [{ method: 'cash', amount: 50_000 }],
  })
  const [sale] = await ctx.db.select().from(sales).where(eq(sales.id, saleId))
  assert.equal(sale!.grandTotal, 47_500)
  assert.equal(sale!.changeTotal, 2_500)

  const closed = await closeShift(ctx.db, actor(cashier.id), { closingCash: 47_500 })
  // 0 + 50 000 tendered − 2 500 change = 47 500 in the drawer.
  assert.equal(closed.expectedCash, 47_500)
  assert.equal(closed.difference, 0)
})

test('void sales are excluded from expectedCash', async () => {
  const cashier = await createUser(ctx.db)
  await createSettings(ctx.db, { taxEnabled: false, taxRate: 0 })
  const product = await createProduct(ctx.db, { price: 10_000, stock: 50 })
  await openShift(ctx.db, actor(cashier.id), { openingCash: 0 })

  const { saleId } = await checkoutSale(ctx.db, actor(cashier.id), {
    items: [{ productId: product.id, qty: 1 }],
    payments: [{ method: 'cash', amount: 10_000 }],
  })


  await voidSale(ctx.db, actor(cashier.id), saleId)
  const [voided] = await ctx.db.select().from(sales).where(eq(sales.id, saleId))
  assert.equal(voided!.status, 'void')

  const closed = await closeShift(ctx.db, actor(cashier.id), { closingCash: 0 })
  assert.equal(closed.expectedCash, 0)
})

test('closeShift writes the audit row inside the transaction and rejects when none is open', async () => {
  const cashier = await createUser(ctx.db)
  await openShift(ctx.db, actor(cashier.id), { openingCash: 100_000 })
  const closed = await closeShift(ctx.db, actor(cashier.id), { closingCash: 90_000 })
  assert.equal(closed.difference, -10_000)

  const audit = await ctx.db.select().from(auditLogs)
    .where(and(eq(auditLogs.action, 'close_shift'), eq(auditLogs.entityId, closed.id)))
  assert.equal(audit.length, 1)
  assert.equal(audit[0]!.actorUserId, cashier.id)

  await assert.rejects(
    closeShift(ctx.db, actor(cashier.id), { closingCash: 1 }),
    /Tidak ada shift aktif untuk ditutup/,
  )
})

test('closeShift closes stale duplicate open rows flat (legacy data)', async () => {
  const cashier = await createUser(ctx.db)
  // The partial unique index normally prevents duplicates; legacy DBs may have them.
  await ctx.client.exec(`drop index "shifts_one_open_per_cashier_idx"`)
  const older = await createOpenShift(ctx.db, cashier.id, {
    openingCash: 5_000, openedAt: new Date(Date.now() - 120_000),
  })
  const newest = await createOpenShift(ctx.db, cashier.id, { openingCash: 100_000 })

  const closed = await closeShift(ctx.db, actor(cashier.id), { closingCash: 100_000 })
  assert.equal(closed.id, newest.id)

  // Restore the constraint the schema declares, now that no duplicates remain.
  await ctx.client.exec(
    `create unique index "shifts_one_open_per_cashier_idx" on "shifts" ("cashier_id") where status = 'open'`,
  )

  const [stale] = await ctx.db.select().from(shifts).where(eq(shifts.id, older.id))
  assert.equal(stale!.status, 'closed')
  assert.equal(stale!.closingCash, 5_000)
  assert.equal(stale!.expectedCash, 5_000)
  assert.equal(stale!.difference, 0)

  const openRows = await ctx.db.select().from(shifts).where(eq(shifts.status, 'open'))
  assert.equal(openRows.length, 0)
})

test('computeExpectedCash reads through a tx handle', async () => {
  const cashier = await createUser(ctx.db)
  await createSettings(ctx.db, { taxEnabled: false, taxRate: 0 })
  const product = await createProduct(ctx.db, { price: 7_500, stock: 10 })
  const opened = await createOpenShift(ctx.db, cashier.id, { openingCash: 25_000 })
  await checkoutSale(ctx.db, actor(cashier.id), {
    items: [{ productId: product.id, qty: 2 }],
    payments: [{ method: 'cash', amount: 15_000 }],
  })

  const expected = await ctx.db.transaction(async (tx) => computeExpectedCash(tx, opened))
  assert.equal(expected, 40_000)
})
