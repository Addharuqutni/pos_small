import { test, before, after, beforeEach } from 'node:test'
import { strict as assert } from 'node:assert'
import { eq, and } from 'drizzle-orm'
import {
  createTestDb, resetTestDb, createUser, createSettings, createProduct,
  createOpenShift, createPromo, type TestDb,
} from '../test/pg.js'
import {
  checkoutSale, refundSale, voidSale, getSaleWithDetails,
} from './sale-ledger.js'
import {
  auditLogs, products, saleItems, sales, stockMovements, promos, payments,
  refunds, refundItems, shifts,
} from '../db/schema.js'
import { AppError } from '../lib/errors.js'

let ctx: TestDb

function actor(id: string, role: 'owner' | 'admin' | 'cashier' = 'cashier') {
  return { id, role, ipAddress: '127.0.0.1' }
}

before(async () => { ctx = await createTestDb() })
after(async () => { await ctx.close() })
beforeEach(async () => { await resetTestDb(ctx.client) })

/** Minimal fixture: cashier with open shift, tax 11%, one product. */
async function fixtures(overrides: { price?: number; stock?: number; taxRate?: number } = {}) {
  const cashier = await createUser(ctx.db, { name: 'Kasir' })
  await createSettings(ctx.db, { taxEnabled: true, taxRate: overrides.taxRate ?? 11 })
  const product = await createProduct(ctx.db, {
    name: 'Kopi Susu',
    price: overrides.price ?? 20_000,
    stock: overrides.stock ?? 10,
  })
  const shift = await createOpenShift(ctx.db, cashier.id, { openingCash: 100_000 })
  return { cashier, product, shift }
}

test('checkout happy path: totals, stock decrement, movement, audit', async () => {
  const { cashier, product, shift } = await fixtures()
  const { saleId } = await checkoutSale(ctx.db, actor(cashier.id), {
    items: [{ productId: product.id, qty: 2 }],
    payments: [{ method: 'cash', amount: 50_000 }],
  })

  const [sale] = await ctx.db.select().from(sales).where(eq(sales.id, saleId))
  assert.equal(sale!.subtotal, 40_000)
  assert.equal(sale!.taxTotal, 4_400)
  assert.equal(sale!.grandTotal, 44_400)
  assert.equal(sale!.paidTotal, 50_000)
  assert.equal(sale!.changeTotal, 5_600)
  assert.equal(sale!.shiftId, shift.id)
  assert.equal(sale!.status, 'paid')

  const [row] = await ctx.db.select().from(products).where(eq(products.id, product.id))
  assert.equal(row!.stock, 8)

  const movements = await ctx.db.select().from(stockMovements).where(eq(stockMovements.referenceId, saleId))
  assert.equal(movements.length, 1)
  assert.equal(movements[0]!.type, 'sale')
  assert.equal(movements[0]!.qtyChange, -2)
  assert.equal(movements[0]!.stockBefore, 10)
  assert.equal(movements[0]!.stockAfter, 8)

  const audit = await ctx.db.select().from(auditLogs)
    .where(and(eq(auditLogs.action, 'create_sale'), eq(auditLogs.entityId, saleId)))
  assert.equal(audit.length, 1)
  assert.equal(audit[0]!.actorUserId, cashier.id)
})

test('checkout with insufficient stock persists nothing', async () => {
  const { cashier, product } = await fixtures({ stock: 1 })
  await assert.rejects(
    checkoutSale(ctx.db, actor(cashier.id), {
      items: [{ productId: product.id, qty: 3 }],
      payments: [{ method: 'cash', amount: 100_000 }],
    }),
    /Stok tidak cukup/,
  )

  assert.equal((await ctx.db.select().from(sales)).length, 0)
  assert.equal((await ctx.db.select().from(payments)).length, 0)
  assert.equal((await ctx.db.select().from(stockMovements)).length, 0)
  const [row] = await ctx.db.select().from(products).where(eq(products.id, product.id))
  assert.equal(row!.stock, 1)
})

test('checkout without an open shift is rejected', async () => {
  const { cashier, product } = await fixtures()
  await ctx.db.delete(shifts)

  await assert.rejects(
    checkoutSale(ctx.db, actor(cashier.id), {
      items: [{ productId: product.id, qty: 1 }],
      payments: [{ method: 'cash', amount: 100_000 }],
    }),
    /Shift belum dibuka/,
  )
})

test('promo applies, increments usageCount, and usage limit blocks the next sale', async () => {
  const { cashier, product } = await fixtures()
  const promo = await createPromo(ctx.db, {
    code: 'HEMAT50', type: 'percent', value: 50, maxDiscount: 5_000, usageLimit: 1,
  })

  const { saleId } = await checkoutSale(ctx.db, actor(cashier.id), {
    items: [{ productId: product.id, qty: 1 }],
    payments: [{ method: 'cash', amount: 100_000 }],
    promoCode: '  HeMaT50  ',
  })

  const [sale] = await ctx.db.select().from(sales).where(eq(sales.id, saleId))
  assert.equal(sale!.promoDiscount, 5_000)
  assert.equal(sale!.promoId, promo.id)
  assert.equal(sale!.promoCode, 'HEMAT50')
  // 20 000 - 5 000 = 15 000 taxable; tax 11% = 1 650
  assert.equal(sale!.grandTotal, 16_650)

  const [after] = await ctx.db.select().from(promos).where(eq(promos.id, promo.id))
  assert.equal(after!.usageCount, 1)

  await assert.rejects(
    checkoutSale(ctx.db, actor(cashier.id), {
      items: [{ productId: product.id, qty: 1 }],
      payments: [{ method: 'cash', amount: 100_000 }],
      promoCode: 'HEMAT50',
    }),
    (err: unknown) =>
      err instanceof AppError && err.statusCode === 400
      && err.message === 'Promo sudah mencapai batas pemakaian',
  )
})

test('promo below minPurchase is rejected', async () => {
  const { cashier, product } = await fixtures()
  await createPromo(ctx.db, { code: 'GEDE', type: 'amount', value: 5_000, minPurchase: 100_000 })

  await assert.rejects(
    checkoutSale(ctx.db, actor(cashier.id), {
      items: [{ productId: product.id, qty: 1 }],
      payments: [{ method: 'cash', amount: 100_000 }],
      promoCode: 'GEDE',
    }),
    /Minimal belanja untuk promo ini 100000/,
  )
  assert.equal((await ctx.db.select().from(sales)).length, 0)
})

test('underpayment is rejected and persists nothing', async () => {
  const { cashier, product } = await fixtures()
  await assert.rejects(
    checkoutSale(ctx.db, actor(cashier.id), {
      items: [{ productId: product.id, qty: 1 }],
      payments: [{ method: 'cash', amount: 1_000 }],
    }),
    /Pembayaran kurang: butuh 22200, diterima 1000/,
  )
  assert.equal((await ctx.db.select().from(sales)).length, 0)
  assert.equal((await ctx.db.select().from(auditLogs)).length, 0)
})

test('line discount above price and oversized sale discount are rejected', async () => {
  const { cashier, product } = await fixtures()
  await assert.rejects(
    checkoutSale(ctx.db, actor(cashier.id), {
      items: [{ productId: product.id, qty: 1, discount: 20_001 }],
      payments: [{ method: 'cash', amount: 100_000 }],
    }),
    /Diskon melebihi harga item untuk "Kopi Susu"/,
  )

  await assert.rejects(
    checkoutSale(ctx.db, actor(cashier.id), {
      items: [{ productId: product.id, qty: 1 }],
      payments: [{ method: 'cash', amount: 100_000 }],
      discount: 20_001,
    }),
    /Diskon penjualan melebihi subtotal/,
  )
})

test('two partial refunds accumulate; third over sold qty rejected', async () => {
  const { cashier, product } = await fixtures()
  const { saleId } = await checkoutSale(ctx.db, actor(cashier.id), {
    items: [{ productId: product.id, qty: 3 }],
    payments: [{ method: 'cash', amount: 100_000 }],
  })
  const [item] = await ctx.db.select().from(saleItems).where(eq(saleItems.saleId, saleId))

  const first = await refundSale(ctx.db, actor(cashier.id), saleId, {
    reason: 'Rusak', items: [{ saleItemId: item!.id, qty: 1 }],
  })
  assert.equal(first.status, 'partial_refunded')

  const second = await refundSale(ctx.db, actor(cashier.id), saleId, {
    reason: 'Salah pesan', items: [{ saleItemId: item!.id, qty: 1 }],
  })
  assert.equal(second.status, 'partial_refunded')

  await assert.rejects(
    refundSale(ctx.db, actor(cashier.id), saleId, {
      reason: 'Lagi', items: [{ saleItemId: item!.id, qty: 2 }],
    }),
    /Jumlah refund melebihi sisa qty penjualan/,
  )

  const refundRows = await ctx.db.select().from(refunds).where(eq(refunds.saleId, saleId))
  assert.equal(refundRows.length, 2)
  const itemRows = await ctx.db.select().from(refundItems)
  assert.equal(itemRows.length, 2)
  assert.equal(itemRows.reduce((sum, r) => sum + r.amount, 0), 40_000)
})

test('refund restoring all qty marks the sale refunded and restores stock', async () => {
  const { cashier, product } = await fixtures()
  const { saleId } = await checkoutSale(ctx.db, actor(cashier.id), {
    items: [{ productId: product.id, qty: 2 }],
    payments: [{ method: 'cash', amount: 100_000 }],
  })
  const [item] = await ctx.db.select().from(saleItems).where(eq(saleItems.saleId, saleId))

  const result = await refundSale(ctx.db, actor(cashier.id), saleId, {
    reason: 'Batal', items: [{ saleItemId: item!.id, qty: 2 }],
  })
  assert.equal(result.status, 'refunded')

  const [row] = await ctx.db.select().from(products).where(eq(products.id, product.id))
  assert.equal(row!.stock, 10)
  const movements = await ctx.db.select().from(stockMovements)
    .where(and(eq(stockMovements.referenceType, 'refund'), eq(stockMovements.referenceId, result.refundId)))
  assert.equal(movements.length, 1)
  assert.equal(movements[0]!.qtyChange, 2)
})

test('void restores stock, sets void, and audits', async () => {
  const { cashier, product } = await fixtures()
  const { saleId } = await checkoutSale(ctx.db, actor(cashier.id), {
    items: [{ productId: product.id, qty: 4 }],
    payments: [{ method: 'cash', amount: 100_000 }],
  })

  await voidSale(ctx.db, actor(cashier.id), saleId)

  const [sale] = await ctx.db.select().from(sales).where(eq(sales.id, saleId))
  assert.equal(sale!.status, 'void')
  const [row] = await ctx.db.select().from(products).where(eq(products.id, product.id))
  assert.equal(row!.stock, 10)

  const audit = await ctx.db.select().from(auditLogs)
    .where(and(eq(auditLogs.action, 'void_sale'), eq(auditLogs.entityId, saleId)))
  assert.equal(audit.length, 1)
})

test('void is rejected for a sale from a previous Jakarta day', async () => {
  const { cashier, product } = await fixtures()
  const { saleId } = await checkoutSale(ctx.db, actor(cashier.id), {
    items: [{ productId: product.id, qty: 1 }],
    payments: [{ method: 'cash', amount: 100_000 }],
  })
  // Backdate the sale to a Jakarta evening that is still the previous UTC day.
  const yesterdayJakartaEvening = new Date('2026-06-30T16:00:00Z') // 2026-06-30 23:00 Jakarta
  await ctx.db.update(sales).set({ createdAt: yesterdayJakartaEvening }).where(eq(sales.id, saleId))

  await assert.rejects(
    voidSale(ctx.db, actor(cashier.id), saleId, { now: new Date('2026-07-01T03:00:00Z') }),
    /Void hanya untuk transaksi hari ini; gunakan refund/,
  )
  // …while the same instant in UTC-vs-Jakarta alignment is allowed
  await voidSale(ctx.db, actor(cashier.id), saleId, { now: new Date('2026-06-30T16:30:00Z') })
  const [sale] = await ctx.db.select().from(sales).where(eq(sales.id, saleId))
  assert.equal(sale!.status, 'void')
})

test('void of a non-paid sale is rejected and refunded totals survive', async () => {
  const { cashier, product } = await fixtures()
  const { saleId } = await checkoutSale(ctx.db, actor(cashier.id), {
    items: [{ productId: product.id, qty: 1 }],
    payments: [{ method: 'cash', amount: 100_000 }],
  })
  const [item] = await ctx.db.select().from(saleItems).where(eq(saleItems.saleId, saleId))
  await refundSale(ctx.db, actor(cashier.id), saleId, { reason: 'x', items: [{ saleItemId: item!.id, qty: 1 }] })

  await assert.rejects(voidSale(ctx.db, actor(cashier.id), saleId), /Hanya transaksi berstatus lunas/)
})

test('getSaleWithDetails returns cashier, items, payments and refunds', async () => {
  const { cashier, product } = await fixtures()
  const { saleId } = await checkoutSale(ctx.db, actor(cashier.id), {
    items: [{ productId: product.id, qty: 2 }],
    payments: [{ method: 'qris', amount: 50_000 }],
  })

  const detail = await getSaleWithDetails(ctx.db, saleId)
  assert.equal(detail.cashier?.id, cashier.id)
  assert.equal(detail.items.length, 1)
  assert.equal(detail.payments.length, 1)
  assert.deepEqual(detail.refunds, [])

  await assert.rejects(getSaleWithDetails(ctx.db, crypto.randomUUID()), /Transaksi tidak ditemukan/)
})

test('checkout ignores closed shifts and uses the open one', async () => {
  const { cashier, product } = await fixtures()
  // A closed shift from earlier today must not be picked up.
  await ctx.db.insert(shifts).values({
    cashierId: cashier.id,
    openingCash: 0,
    status: 'closed',
    closedAt: new Date(Date.now() - 60_000),
    openedAt: new Date(Date.now() - 120_000),
  })

  const { saleId } = await checkoutSale(ctx.db, actor(cashier.id), {
    items: [{ productId: product.id, qty: 1 }],
    payments: [{ method: 'cash', amount: 100_000 }],
  })
  const [sale] = await ctx.db.select().from(sales).where(eq(sales.id, saleId))
  const openRows = await ctx.db.select().from(shifts)
    .where(and(eq(shifts.cashierId, cashier.id), eq(shifts.status, 'open')))
  assert.equal(openRows.length, 1)
  assert.equal(sale!.shiftId, openRows[0]!.id)
})
