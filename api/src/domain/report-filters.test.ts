import { test, before, after, beforeEach } from 'node:test'
import { strict as assert } from 'node:assert'
import { and, eq, gte, lte } from 'drizzle-orm'
import {
  createTestDb, resetTestDb, createUser, createProduct, createOpenShift, type TestDb,
} from '../test/pg.js'
import { checkoutSale, refundSale, voidSale } from './sale-ledger.js'
import { reportFilterConditions, type ReportFilters } from './report-filters.js'
import { cashierReport } from './cashier-report.js'
import { categories, saleItems, sales } from '../db/schema.js'

let ctx: TestDb

function actor(id: string, role: 'owner' | 'admin' | 'cashier' = 'cashier') {
  return { id, role, ipAddress: '127.0.0.1' }
}

before(async () => { ctx = await createTestDb() })
after(async () => { await ctx.close() })
beforeEach(async () => { await resetTestDb(ctx.client) })

const RANGE = { start: '2020-01-01T00:00:00Z', end: '2030-01-01T00:00:00Z' }

/** Runs a sale-id query through the shared filter builder. */
async function saleIdsMatching(filters: ReportFilters): Promise<string[]> {
  const rows = await ctx.db
    .select({ id: sales.id, invoiceNo: sales.invoiceNo })
    .from(sales)
    .where(and(
      gte(sales.createdAt, new Date(RANGE.start)),
      lte(sales.createdAt, new Date(RANGE.end)),
      ...reportFilterConditions(filters),
    ))
    .orderBy(sales.invoiceNo)
  return rows.map((row) => row.invoiceNo)
}

test('report filters: cashierId, paymentMethod, status, categoryId, productId', async () => {
  const a = await createUser(ctx.db, { name: 'Ani' })
  const b = await createUser(ctx.db, { name: 'Budi' })
  await createOpenShift(ctx.db, a.id, { openingCash: 0 })
  await createOpenShift(ctx.db, b.id, { openingCash: 0 })

  const [kopiCat] = await ctx.db.insert(categories).values({ name: 'Kopi' }).returning()
  const kopi = await createProduct(ctx.db, { name: 'Kopi', price: 10_000, stock: 20, categoryId: kopiCat!.id })
  const teh = await createProduct(ctx.db, { name: 'Teh', price: 20_000, stock: 20 })

  // Ani: one cash Kopi sale, one qris Teh sale.
  await checkoutSale(ctx.db, actor(a.id), {
    items: [{ productId: kopi.id, qty: 1 }], payments: [{ method: 'cash', amount: 10_000 }],
  })
  await checkoutSale(ctx.db, actor(a.id), {
    items: [{ productId: teh.id, qty: 1 }], payments: [{ method: 'qris', amount: 20_000 }],
  })
  // Budi: a cash Kopi sale that is then voided.
  const { saleId: voidId } = await checkoutSale(ctx.db, actor(b.id), {
    items: [{ productId: kopi.id, qty: 1 }], payments: [{ method: 'cash', amount: 10_000 }],
  })
  await voidSale(ctx.db, actor(b.id), voidId)

  const all = await saleIdsMatching({})
  assert.equal(all.length, 2) // void excluded by default

  assert.deepEqual(await saleIdsMatching({ cashierId: a.id }), all)
  assert.deepEqual(await saleIdsMatching({ cashierId: b.id }), [])

  const cashOnly = await saleIdsMatching({ paymentMethod: 'cash' })
  assert.equal(cashOnly.length, 1)
  assert.deepEqual(await saleIdsMatching({ paymentMethod: 'transfer' }), [])

  assert.equal((await saleIdsMatching({ categoryId: kopiCat!.id })).length, 1)
  assert.equal((await saleIdsMatching({ productId: teh.id })).length, 1)
  assert.equal((await saleIdsMatching({ productId: teh.id, categoryId: kopiCat!.id })).length, 0)

  // An explicit status overrides the "exclude void" default.
  assert.equal((await saleIdsMatching({ status: 'void' })).length, 1)
  assert.equal((await saleIdsMatching({ status: 'paid' })).length, 2)
})

test('cashier report buckets non-void/void/mid-refund amounts per cashier', async () => {
  const a = await createUser(ctx.db, { name: 'Ani' })
  const b = await createUser(ctx.db, { name: 'Budi' })
  await createOpenShift(ctx.db, a.id, { openingCash: 0 })
  await createOpenShift(ctx.db, b.id, { openingCash: 0 })
  const product = await createProduct(ctx.db, { name: 'Kopi', price: 20_000, costPrice: 12_000, stock: 20 })

  // Ani: two paid sales (40 000 with 2 000 manual discount), one refunded 20 000,
  // and one voided sale that must land in voidCount/voidTotal.
  const { saleId: refundedSale } = await checkoutSale(ctx.db, actor(a.id), {
    items: [{ productId: product.id, qty: 1 }],
    payments: [{ method: 'cash', amount: 20_000 }],
  })
  const [refundedItem] = await ctx.db.select().from(saleItems).where(eq(saleItems.saleId, refundedSale))
  await refundSale(ctx.db, actor(a.id), refundedSale, {
    reason: 'Rusak', items: [{ saleItemId: refundedItem!.id, qty: 1 }],
  })
  await checkoutSale(ctx.db, actor(a.id), {
    items: [{ productId: product.id, qty: 1 }],
    payments: [{ method: 'qris', amount: 18_000 }],
    discount: 2_000,
  })
  const { saleId: voidId } = await checkoutSale(ctx.db, actor(a.id), {
    items: [{ productId: product.id, qty: 1 }],
    payments: [{ method: 'cash', amount: 20_000 }],
  })
  await voidSale(ctx.db, actor(a.id), voidId)

  // Budi: a single qris sale.
  await checkoutSale(ctx.db, actor(b.id), {
    items: [{ productId: product.id, qty: 1 }],
    payments: [{ method: 'qris', amount: 20_000 }],
  })

  const rows = await cashierReport(ctx.db, { ...RANGE })
  assert.deepEqual(rows.map((row) => row.cashierName), ['Ani', 'Budi'])

  const ani = rows[0]!
  assert.equal(ani.cashierId, a.id)
  // Non-void sales: 20 000 (refunded) + 18 000 gross; discounts 0 + 2 000.
  assert.equal(ani.saleCount, 2)
  assert.equal(ani.grossSales, 38_000)
  assert.equal(ani.discountTotal, 2_000)
  assert.equal(ani.voidCount, 1)
  assert.equal(ani.voidTotal, 20_000)
  assert.equal(ani.refundTotal, 20_000)
  assert.equal(ani.netSales, 18_000)

  const budi = rows[1]!
  assert.equal(budi.saleCount, 1)
  assert.equal(budi.grossSales, 20_000)
  assert.equal(budi.refundTotal, 0)
  assert.equal(budi.netSales, 20_000)

  // An explicit `status` narrows the whole row set — including the refund
  // subquery: the refunded sale is `refunded`, so its refund drops out too.
  const paidOnly = await cashierReport(ctx.db, { ...RANGE, filters: { status: 'paid' } })
  const aniPaid = paidOnly.find((row) => row.cashierId === a.id)!
  assert.equal(aniPaid.saleCount, 1)
  assert.equal(aniPaid.grossSales, 18_000)
  assert.equal(aniPaid.voidCount, 0)
  assert.equal(aniPaid.refundTotal, 0)

  const voidOnly = await cashierReport(ctx.db, { ...RANGE, filters: { status: 'void' } })
  const aniVoid = voidOnly.find((row) => row.cashierId === a.id)!
  assert.equal(aniVoid.saleCount, 0)
  assert.equal(aniVoid.grossSales, 0)
  assert.equal(aniVoid.voidCount, 1)
  assert.equal(aniVoid.voidTotal, 20_000)
})

test('cashier report honours cashierId and paymentMethod filters', async () => {
  const a = await createUser(ctx.db, { name: 'Ani' })
  const b = await createUser(ctx.db, { name: 'Budi' })
  await createOpenShift(ctx.db, a.id, { openingCash: 0 })
  await createOpenShift(ctx.db, b.id, { openingCash: 0 })
  const product = await createProduct(ctx.db, { name: 'Kopi', price: 20_000, stock: 20 })

  await checkoutSale(ctx.db, actor(a.id), {
    items: [{ productId: product.id, qty: 1 }], payments: [{ method: 'cash', amount: 20_000 }],
  })
  await checkoutSale(ctx.db, actor(b.id), {
    items: [{ productId: product.id, qty: 1 }], payments: [{ method: 'qris', amount: 20_000 }],
  })

  const cashRows = await cashierReport(ctx.db, { ...RANGE, filters: { paymentMethod: 'cash' } })
  assert.deepEqual(cashRows.map((row) => row.cashierName), ['Ani'])

  const budiRows = await cashierReport(ctx.db, { ...RANGE, filters: { cashierId: b.id } })
  assert.deepEqual(budiRows.map((row) => row.cashierName), ['Budi'])
  assert.equal(budiRows[0]!.grossSales, 20_000)
})

test('report filters exclude void by default and can opt out', async () => {
  const cashier = await createUser(ctx.db)
  await createOpenShift(ctx.db, cashier.id, { openingCash: 0 })
  const product = await createProduct(ctx.db, { name: 'Kopi', price: 10_000, stock: 5 })
  const { saleId } = await checkoutSale(ctx.db, actor(cashier.id), {
    items: [{ productId: product.id, qty: 1 }], payments: [{ method: 'cash', amount: 10_000 }],
  })
  await voidSale(ctx.db, actor(cashier.id), saleId)

  assert.equal(reportFilterConditions({}).length, 1)
  assert.equal(reportFilterConditions({}, { excludeVoidByDefault: false }).length, 0)

  const rows = await ctx.db
    .select({ id: sales.id })
    .from(sales)
    .where(and(...reportFilterConditions({}, { excludeVoidByDefault: false }), eq(sales.id, saleId)))
  assert.equal(rows.length, 1)
})
