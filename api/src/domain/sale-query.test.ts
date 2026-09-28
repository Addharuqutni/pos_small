import { test, before, after, beforeEach } from 'node:test'
import { strict as assert } from 'node:assert'
import {
  createTestDb, resetTestDb, createUser, createSettings, createProduct,
  createOpenShift, type TestDb,
} from '../test/pg.js'
import { checkoutSale } from './sale-ledger.js'
import { canReadSale, listSales, saleDetailForActor } from './sale-query.js'
import { openShift, listShifts } from './shift.js'
import { AppError } from '../lib/errors.js'

let ctx: TestDb

before(async () => { ctx = await createTestDb() })
after(async () => { await ctx.close() })
beforeEach(async () => { await resetTestDb(ctx.client) })

/** Two cashiers, each with one sale; returns ids. */
async function twoCashiersWithSales() {
  await createSettings(ctx.db, { taxEnabled: false, taxRate: 0 })
  const product = await createProduct(ctx.db, { price: 10_000, stock: 100 })
  const a = await createUser(ctx.db, { name: 'Kasir A' })
  const b = await createUser(ctx.db, { name: 'Kasir B' })
  await createOpenShift(ctx.db, a.id)
  await createOpenShift(ctx.db, b.id)

  const saleA = await checkoutSale(ctx.db, { id: a.id, role: 'cashier' }, {
    items: [{ productId: product.id, qty: 1 }],
    payments: [{ method: 'cash', amount: 10_000 }],
  })
  const saleB = await checkoutSale(ctx.db, { id: b.id, role: 'cashier' }, {
    items: [{ productId: product.id, qty: 2 }],
    payments: [{ method: 'cash', amount: 20_000 }],
  })
  return { a, b, saleA: saleA.saleId, saleB: saleB.saleId }
}

test('listSales: cashier sees only own sales; owner/admin see all', async () => {
  const { a, b } = await twoCashiersWithSales()

  const forA = await listSales(ctx.db, { id: a.id, role: 'cashier' }, { page: 1, limit: 20 })
  assert.equal(forA.total, 1)
  assert.equal(forA.data[0]!.cashierId, a.id)

  const forB = await listSales(ctx.db, { id: b.id, role: 'cashier' }, { page: 1, limit: 20 })
  assert.equal(forB.total, 1)
  assert.equal(forB.data[0]!.cashierId, b.id)

  const owner = await listSales(ctx.db, { id: 'whatever', role: 'owner' }, { page: 1, limit: 20 })
  assert.equal(owner.total, 2)

  const admin = await listSales(ctx.db, { id: 'whatever', role: 'admin' }, { page: 1, limit: 20 })
  assert.equal(admin.total, 2)
})

test('listSales: scoping also applies to filtered searches and other pages', async () => {
  const { a } = await twoCashiersWithSales()

  // Searching for the other cashier's invoice must not reveal it to A.
  const other = await ctx.db.query.sales.findFirst()
  const q = other!.invoiceNo.slice(0, 8)
  const filtered = await listSales(ctx.db, { id: a.id, role: 'cashier' }, { page: 1, limit: 20, q })
  assert.equal(filtered.total, 1)

  const page2 = await listSales(ctx.db, { id: a.id, role: 'cashier' }, { page: 2, limit: 1 })
  assert.equal(page2.data.length, 0)
  assert.equal(page2.total, 1)
})

test('saleDetailForActor: own sale allowed, other cashier 404, owner/admin allowed', async () => {
  const { a, b, saleA, saleB } = await twoCashiersWithSales()

  const own = await saleDetailForActor(ctx.db, { id: a.id, role: 'cashier' }, saleA)
  assert.equal(own.id, saleA)

  await assert.rejects(
    saleDetailForActor(ctx.db, { id: a.id, role: 'cashier' }, saleB),
    (err: unknown) => err instanceof AppError && err.statusCode === 404,
  )

  const owner = await saleDetailForActor(ctx.db, { id: 'x', role: 'owner' }, saleB)
  assert.equal(owner.id, saleB)
  assert.equal(owner.cashier?.id, b.id)
})

test('canReadSale rule: cashier by ownership, elevated roles always', () => {
  const saleOfA = { cashierId: 'a' }
  assert.equal(canReadSale({ id: 'a', role: 'cashier' }, saleOfA), true)
  assert.equal(canReadSale({ id: 'b', role: 'cashier' }, saleOfA), false)
  assert.equal(canReadSale({ id: 'b', role: 'admin' }, saleOfA), true)
  assert.equal(canReadSale({ id: 'b', role: 'owner' }, saleOfA), true)
})

test('listShifts: cashier sees only own shifts; owner sees all', async () => {
  const a = await createUser(ctx.db, { name: 'Kasir A' })
  const b = await createUser(ctx.db, { name: 'Kasir B' })
  await openShift(ctx.db, { id: a.id, role: 'cashier' }, { openingCash: 10_000 })
  await openShift(ctx.db, { id: b.id, role: 'cashier' }, { openingCash: 20_000 })

  const forA = await listShifts(ctx.db, { id: a.id, role: 'cashier' }, { page: 1, limit: 20 })
  assert.equal(forA.length, 1)
  assert.equal(forA[0]!.cashierId, a.id)

  const owner = await listShifts(ctx.db, { id: 'x', role: 'owner' }, { page: 1, limit: 20 })
  assert.equal(owner.length, 2)
})
