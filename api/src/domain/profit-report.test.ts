import { test, before, after, beforeEach } from 'node:test'
import { strict as assert } from 'node:assert'
import { eq } from 'drizzle-orm'
import {
  createTestDb, resetTestDb, createUser, createProduct, createOpenShift,
  createPromo, type TestDb,
} from '../test/pg.js'
import { checkoutSale, refundSale, voidSale } from './sale-ledger.js'
import { profitReport } from './profit-report.js'
import { categories, saleItems, sales } from '../db/schema.js'

let ctx: TestDb

function actor(id: string, role: 'owner' | 'admin' | 'cashier' = 'cashier') {
  return { id, role, ipAddress: '127.0.0.1' }
}

before(async () => { ctx = await createTestDb() })
after(async () => { await ctx.close() })
beforeEach(async () => { await resetTestDb(ctx.client) })

/** Cashier with an open shift; tax off so totals stay easy to reason about. */
async function fixtures() {
  const cashier = await createUser(ctx.db, { name: 'Kasir' })
  await createOpenShift(ctx.db, cashier.id, { openingCash: 0 })
  return { cashier }
}

const ALL_TIME = { start: '2020-01-01T00:00:00Z', end: '2030-01-01T00:00:00Z' }

test('profit allocates sale-level discounts proportionally and derives margin', async () => {
  const { cashier } = await fixtures()
  const [minuman] = await ctx.db.insert(categories).values({ name: 'Minuman' }).returning()
  const kopi = await createProduct(ctx.db, {
    name: 'Kopi', price: 20_000, costPrice: 12_000, stock: 10, categoryId: minuman!.id,
  })
  const kue = await createProduct(ctx.db, { name: 'Kue', price: 30_000, costPrice: 9_000, stock: 10 })
  await createPromo(ctx.db, { code: 'HEMAT5', type: 'amount', value: 5_000 })

  // Subtotal 50 000; promo 5 000 + manual discount 5 000 => factor 0.8.
  await checkoutSale(ctx.db, actor(cashier.id), {
    items: [
      { productId: kopi.id, qty: 1 },
      { productId: kue.id, qty: 1 },
    ],
    payments: [{ method: 'cash', amount: 40_000 }],
    promoCode: 'HEMAT5',
    discount: 5_000,
  })

  const report = await profitReport(ctx.db, { ...ALL_TIME, groupBy: 'product' })
  const byLabel = new Map(report.rows.map((row) => [row.label, row]))

  // Kopi: 20 000 × 0.8 = 16 000 revenue; cogs 12 000; margin 25%.
  const kopiRow = byLabel.get('Kopi')!
  assert.equal(kopiRow.qty, 1)
  assert.equal(kopiRow.revenue, 16_000)
  assert.equal(kopiRow.cogs, 12_000)
  assert.equal(kopiRow.grossProfit, 4_000)
  assert.equal(kopiRow.marginPct, 25)
  assert.equal(kopiRow.hasEstimatedCost, false)

  // Kue: 30 000 × 0.8 = 24 000 revenue; cogs 9 000; margin 62.5%.
  const kueRow = byLabel.get('Kue')!
  assert.equal(kueRow.revenue, 24_000)
  assert.equal(kueRow.cogs, 9_000)
  assert.equal(kueRow.grossProfit, 15_000)
  assert.equal(kueRow.marginPct, 62.5)

  // Summary adds the rounded group values (40 000 − 21 000 = 19 000; 47.5%).
  assert.deepEqual(report.summary, {
    revenue: 40_000,
    cogs: 21_000,
    grossProfit: 19_000,
    marginPct: 47.5,
    hasEstimatedCost: false,
  })
})

test('profit spreads promo discount only (no manual discount) the same way', async () => {
  const { cashier } = await fixtures()
  const product = await createProduct(ctx.db, { name: 'Teh', price: 50_000, costPrice: 20_000, stock: 5 })
  await createPromo(ctx.db, { code: 'P10', type: 'percent', value: 10 })

  await checkoutSale(ctx.db, actor(cashier.id), {
    items: [{ productId: product.id, qty: 1 }],
    payments: [{ method: 'cash', amount: 45_000 }],
    promoCode: 'P10',
  })

  const report = await profitReport(ctx.db, { ...ALL_TIME, groupBy: 'product' })
  assert.equal(report.rows.length, 1)
  assert.equal(report.rows[0]!.revenue, 45_000)
  assert.equal(report.rows[0]!.cogs, 20_000)
  assert.equal(report.rows[0]!.grossProfit, 25_000)
  assert.equal(report.summary.marginPct, 55.6)
})

test('a partial refund reduces allocated revenue and cogs by the refunded qty', async () => {
  const { cashier } = await fixtures()
  const product = await createProduct(ctx.db, { name: 'Kopi', price: 20_000, costPrice: 12_000, stock: 10 })
  const { saleId } = await checkoutSale(ctx.db, actor(cashier.id), {
    items: [{ productId: product.id, qty: 2 }],
    payments: [{ method: 'cash', amount: 40_000 }],
  })
  const [item] = await ctx.db.select().from(saleItems).where(eq(saleItems.saleId, saleId))
  const refunded = await refundSale(ctx.db, actor(cashier.id), saleId, {
    reason: 'Rusak', items: [{ saleItemId: item!.id, qty: 1 }],
  })
  assert.equal(refunded.status, 'partial_refunded')

  const report = await profitReport(ctx.db, { ...ALL_TIME, groupBy: 'product' })
  // revenue 40 000 − 20 000 refunded; cogs 12 000 × (2 − 1).
  assert.equal(report.rows[0]!.qty, 1)
  assert.equal(report.rows[0]!.revenue, 20_000)
  assert.equal(report.rows[0]!.cogs, 12_000)
  assert.equal(report.rows[0]!.grossProfit, 8_000)
  assert.equal(report.summary.revenue, 20_000)
  assert.equal(report.summary.marginPct, 40)
})

test('void sales are excluded while a fully refunded item nets to zero', async () => {
  const { cashier } = await fixtures()
  const voided = await createProduct(ctx.db, { name: 'Batal', price: 10_000, costPrice: 4_000, stock: 5 })
  const returned = await createProduct(ctx.db, { name: 'Retur', price: 15_000, costPrice: 6_000, stock: 5 })

  const { saleId: voidId } = await checkoutSale(ctx.db, actor(cashier.id), {
    items: [{ productId: voided.id, qty: 1 }],
    payments: [{ method: 'cash', amount: 10_000 }],
  })
  await voidSale(ctx.db, actor(cashier.id), voidId)

  const { saleId: refundId } = await checkoutSale(ctx.db, actor(cashier.id), {
    items: [{ productId: returned.id, qty: 1 }],
    payments: [{ method: 'cash', amount: 15_000 }],
  })
  const [item] = await ctx.db.select().from(saleItems).where(eq(saleItems.saleId, refundId))
  await refundSale(ctx.db, actor(cashier.id), refundId, {
    reason: 'Batal', items: [{ saleItemId: item!.id, qty: 1 }],
  })

  const report = await profitReport(ctx.db, { ...ALL_TIME, groupBy: 'product' })
  // The voided sale is gone entirely; the refunded (non-void) one still reports
  // its product as a zeroed row: revenue 0, cogs 0, qty 0.
  assert.deepEqual(report.rows, [
    {
      key: returned.id,
      label: 'Retur',
      qty: 0,
      revenue: 0,
      cogs: 0,
      grossProfit: 0,
      marginPct: null,
      hasEstimatedCost: false,
    },
  ])
  assert.deepEqual(report.summary, {
    revenue: 0, cogs: 0, grossProfit: 0, marginPct: null, hasEstimatedCost: false,
  })
})

test('a refund on a discounted sale never drives revenue or profit negative', async () => {
  const { cashier } = await fixtures()
  const product = await createProduct(ctx.db, { name: 'Kopi Diskon', price: 100_000, costPrice: 40_000, stock: 5 })

  // 100 000 subtotal with 50 000 discount -> 50 000 grand total (discount factor 0.5)
  const { saleId } = await checkoutSale(ctx.db, actor(cashier.id), {
    items: [{ productId: product.id, qty: 1 }],
    payments: [{ method: 'cash', amount: 50_000 }],
    discount: 50_000,
  })
  const [item] = await ctx.db.select().from(saleItems).where(eq(saleItems.saleId, saleId))

  // Fully refund the item
  await refundSale(ctx.db, actor(cashier.id), saleId, {
    reason: 'Salah beli', items: [{ saleItemId: item!.id, qty: 1 }],
  })

  const report = await profitReport(ctx.db, { ...ALL_TIME, groupBy: 'product' })
  assert.equal(report.rows[0]!.revenue, 0)
  assert.equal(report.rows[0]!.cogs, 0)
  assert.equal(report.rows[0]!.grossProfit, 0)
  assert.equal(report.rows[0]!.marginPct, null)
  assert.equal(report.summary.revenue, 0)
  assert.equal(report.summary.grossProfit, 0)
  assert.equal(report.summary.marginPct, null)
})

test('hasEstimatedCost propagates from backfilled sale items to the group and summary', async () => {
  const { cashier } = await fixtures()
  const product = await createProduct(ctx.db, { name: 'Kopi', price: 20_000, costPrice: 12_000, stock: 5 })
  const { saleId } = await checkoutSale(ctx.db, actor(cashier.id), {
    items: [{ productId: product.id, qty: 1 }],
    payments: [{ method: 'cash', amount: 20_000 }],
  })

  // A real checkout is never estimated; simulate the 0002 backfill of old rows.
  await ctx.db.update(saleItems).set({ costEstimated: true }).where(eq(saleItems.saleId, saleId))

  const report = await profitReport(ctx.db, { ...ALL_TIME, groupBy: 'product' })
  assert.equal(report.rows[0]!.hasEstimatedCost, true)
  assert.equal(report.summary.hasEstimatedCost, true)
})

test('groupBy day buckets on the Asia/Jakarta business date', async () => {
  const { cashier } = await fixtures()
  const product = await createProduct(ctx.db, { name: 'Kopi', price: 20_000, costPrice: 12_000, stock: 10 })

  // 2026-06-30 23:30 Jakarta (still 2026-06-30 UTC+7, previous UTC day) …
  const { saleId: lateId } = await checkoutSale(ctx.db, actor(cashier.id), {
    items: [{ productId: product.id, qty: 1 }],
    payments: [{ method: 'cash', amount: 20_000 }],
  })
  await ctx.db.update(sales).set({ createdAt: new Date('2026-06-30T16:30:00Z') }).where(eq(sales.id, lateId))

  // … and 2026-07-01 08:00 Jakarta.
  const { saleId: morningId } = await checkoutSale(ctx.db, actor(cashier.id), {
    items: [{ productId: product.id, qty: 1 }],
    payments: [{ method: 'cash', amount: 20_000 }],
  })
  await ctx.db.update(sales).set({ createdAt: new Date('2026-07-01T01:00:00Z') }).where(eq(sales.id, morningId))

  const report = await profitReport(ctx.db, {
    start: '2026-06-30T00:00:00Z',
    end: '2026-07-01T23:59:59Z',
    groupBy: 'day',
  })

  assert.deepEqual(report.rows.map((row) => row.key), ['2026-06-30', '2026-07-01'])
  assert.deepEqual(report.rows.map((row) => row.label), ['2026-06-30', '2026-07-01'])
  assert.equal(report.summary.revenue, 40_000)
})

test('status=void still reports nothing: profit never includes void sales', async () => {
  const { cashier } = await fixtures()
  const product = await createProduct(ctx.db, { name: 'Kopi', price: 20_000, costPrice: 12_000, stock: 5 })
  const { saleId } = await checkoutSale(ctx.db, actor(cashier.id), {
    items: [{ productId: product.id, qty: 1 }],
    payments: [{ method: 'cash', amount: 20_000 }],
  })
  await voidSale(ctx.db, actor(cashier.id), saleId)

  const report = await profitReport(ctx.db, { ...ALL_TIME, groupBy: 'product', filters: { status: 'void' } })
  assert.deepEqual(report.rows, [])
  assert.deepEqual(report.summary, {
    revenue: 0, cogs: 0, grossProfit: 0, marginPct: null, hasEstimatedCost: false,
  })
})

test('productId/categoryId filters select items, not whole sales', async () => {
  const { cashier } = await fixtures()
  const [minuman] = await ctx.db.insert(categories).values({ name: 'Minuman' }).returning()
  const [makanan] = await ctx.db.insert(categories).values({ name: 'Makanan' }).returning()
  const kopi = await createProduct(ctx.db, {
    name: 'Kopi', price: 20_000, costPrice: 12_000, stock: 10, categoryId: minuman!.id,
  })
  const nasi = await createProduct(ctx.db, {
    name: 'Nasi', price: 30_000, costPrice: 18_000, stock: 10, categoryId: makanan!.id,
  })
  // One mixed sale: 1 Minuman + 1 Makanan, exact tender (no sale-level discount).
  await checkoutSale(ctx.db, actor(cashier.id), {
    items: [
      { productId: kopi.id, qty: 1 },
      { productId: nasi.id, qty: 1 },
    ],
    payments: [{ method: 'cash', amount: 50_000 }],
  })

  const byCategory = await profitReport(ctx.db, {
    ...ALL_TIME, groupBy: 'product', filters: { categoryId: minuman!.id },
  })
  // Only the drink line may appear; the food rows of the same sale are excluded.
  assert.deepEqual(byCategory.rows.map((row) => row.label), ['Kopi'])
  assert.equal(byCategory.rows[0]!.revenue, 20_000)
  assert.equal(byCategory.rows[0]!.cogs, 12_000)
  assert.equal(byCategory.summary.revenue, 20_000)
  assert.equal(byCategory.summary.cogs, 12_000)

  const byProduct = await profitReport(ctx.db, {
    ...ALL_TIME, groupBy: 'product', filters: { productId: nasi.id },
  })
  assert.deepEqual(byProduct.rows.map((row) => row.label), ['Nasi'])
  assert.equal(byProduct.summary.revenue, 30_000)
  assert.equal(byProduct.summary.cogs, 18_000)

  // Grouping by category with the same item filter stays consistent.
  const categoryGrouped = await profitReport(ctx.db, {
    ...ALL_TIME, groupBy: 'category', filters: { categoryId: makanan!.id },
  })
  assert.deepEqual(categoryGrouped.rows.map((row) => row.label), ['Makanan'])
  assert.equal(categoryGrouped.summary.revenue, 30_000)
})

test('a zero-subtotal sale allocates no revenue instead of dividing by zero', async () => {
  const { cashier } = await fixtures()
  const freebie = await createProduct(ctx.db, { name: 'Gratis', price: 0, costPrice: 1_000, stock: 5 })
  await checkoutSale(ctx.db, actor(cashier.id), {
    items: [{ productId: freebie.id, qty: 1 }],
    payments: [{ method: 'cash', amount: 0 }],
  })

  const report = await profitReport(ctx.db, { ...ALL_TIME, groupBy: 'product' })
  assert.equal(report.rows.length, 1)
  assert.equal(report.rows[0]!.revenue, 0)
  // A giveaway still costs its snapshot: cogs 1 000, margin undefined.
  assert.equal(report.rows[0]!.cogs, 1_000)
  assert.equal(report.rows[0]!.grossProfit, -1_000)
  assert.equal(report.rows[0]!.marginPct, null)
  assert.equal(report.summary.marginPct, null)
})

test('groupBy category labels uncategorised products "Tanpa kategori"', async () => {
  const { cashier } = await fixtures()
  const [minuman] = await ctx.db.insert(categories).values({ name: 'Minuman' }).returning()
  const kopi = await createProduct(ctx.db, {
    name: 'Kopi', price: 20_000, costPrice: 12_000, stock: 5, categoryId: minuman!.id,
  })
  const lainnya = await createProduct(ctx.db, { name: 'Lain', price: 10_000, costPrice: 4_000, stock: 5 })

  await checkoutSale(ctx.db, actor(cashier.id), {
    items: [
      { productId: kopi.id, qty: 1 },
      { productId: lainnya.id, qty: 1 },
    ],
    payments: [{ method: 'cash', amount: 30_000 }],
  })

  const report = await profitReport(ctx.db, { ...ALL_TIME, groupBy: 'category' })
  const byLabel = new Map(report.rows.map((row) => [row.label, row]))

  const minumanRow = byLabel.get('Minuman')!
  assert.equal(minumanRow.key, minuman!.id)
  assert.equal(minumanRow.revenue, 20_000)
  assert.equal(minumanRow.cogs, 12_000)
  assert.equal(minumanRow.marginPct, 40)

  const uncategorised = byLabel.get('Tanpa kategori')!
  assert.equal(uncategorised.key, null)
  assert.equal(uncategorised.revenue, 10_000)
  assert.equal(uncategorised.cogs, 4_000)

  assert.equal(report.summary.revenue, 30_000)
  assert.equal(report.summary.grossProfit, 14_000)
})
