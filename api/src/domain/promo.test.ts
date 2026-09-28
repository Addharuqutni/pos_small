import { test, before, after, beforeEach } from 'node:test'
import { strict as assert } from 'node:assert'
import { createTestDb, resetTestDb, createPromo, type TestDb } from '../test/pg.js'
import { validatePromo, findEligiblePromo } from './promo.js'
import { AppError, BadRequest } from '../lib/errors.js'

let ctx: TestDb

before(async () => { ctx = await createTestDb() })
after(async () => { await ctx.close() })
beforeEach(async () => { await resetTestDb(ctx.client) })

test('validatePromo returns the fields the cashier UI feeds to priceSale', async () => {
  const promo = await createPromo(ctx.db, {
    code: 'HEMAT', type: 'percent', value: 10, minPurchase: 50_000, maxDiscount: 20_000,
  })

  const result = await validatePromo(ctx.db, 'HEMAT', 100_000)
  assert.deepEqual(result, {
    id: promo.id,
    code: 'HEMAT',
    name: promo.name,
    type: 'percent',
    value: 10,
    minPurchase: 50_000,
    maxDiscount: 20_000,
    discount: 10_000,
  })
})

test('validatePromo reports minPurchase on the promo even before the cart qualifies', async () => {
  const promo = await createPromo(ctx.db, {
    code: 'GEDE', type: 'amount', value: 5_000, minPurchase: 200_000, maxDiscount: null,
  })

  await assert.rejects(
    validatePromo(ctx.db, 'GEDE', 30_000),
    (err: unknown) => err instanceof AppError && err.message === 'Minimal belanja untuk promo ini 200000',
  )
  // The UI can still learn the threshold from the promo itself.
  assert.equal(promo.minPurchase, 200_000)
})

test('validatePromo rejects inactive/expired codes and exhausted usage limits', async () => {
  const inactive = await createPromo(ctx.db, { code: 'OFF', isActive: false })
  await assert.rejects(validatePromo(ctx.db, 'OFF', 100_000), /Promo tidak ditemukan atau sudah tidak berlaku/)

  await createPromo(ctx.db, {
    code: 'OLD', startsAt: new Date('2020-01-01T00:00:00Z'), endsAt: new Date('2020-02-01T00:00:00Z'),
  })
  await assert.rejects(validatePromo(ctx.db, 'OLD', 100_000), /Promo tidak ditemukan atau sudah tidak berlaku/)

  const exhausted = await createPromo(ctx.db, { code: 'FULL', usageLimit: 2, usageCount: 2 })
  assert.equal(exhausted.usageLimit, 2)
  await assert.rejects(validatePromo(ctx.db, 'FULL', 100_000), /Promo sudah mencapai batas pemakaian/)

  assert.ok(inactive.id)
})

test('validatePromo applies the cap to percent and clamps amount promos', async () => {
  await createPromo(ctx.db, { code: 'CAPPED', type: 'percent', value: 50, maxDiscount: 5_000 })
  assert.equal((await validatePromo(ctx.db, 'CAPPED', 100_000)).discount, 5_000)

  await createPromo(ctx.db, { code: 'FLAT', type: 'amount', value: 150_000, maxDiscount: null })
  assert.equal((await validatePromo(ctx.db, 'FLAT', 100_000)).discount, 100_000)
})

test('findEligiblePromo normalises the code the same way for every caller', async () => {
  const promo = await createPromo(ctx.db, { code: 'HEMAT50' })

  assert.equal((await findEligiblePromo(ctx.db, 'HEMAT50')).id, promo.id)
  assert.equal((await findEligiblePromo(ctx.db, 'hemat50')).id, promo.id)
  assert.equal((await findEligiblePromo(ctx.db, '  HeMaT50  ')).id, promo.id)
  assert.equal((await validatePromo(ctx.db, 'hemat50', 100_000)).id, promo.id)
})

test('findEligiblePromo throws the error class the caller asks for', async () => {
  await assert.rejects(
    findEligiblePromo(ctx.db, 'NOPE'),
    (err: unknown) => err instanceof AppError && err.statusCode === 404,
  )
  await assert.rejects(
    findEligiblePromo(ctx.db, 'NOPE', { onError: BadRequest }),
    (err: unknown) => err instanceof AppError && err.statusCode === 400,
  )

  await createPromo(ctx.db, { code: 'FULL', usageLimit: 1, usageCount: 1 })
  await assert.rejects(
    findEligiblePromo(ctx.db, 'FULL', { onError: BadRequest }),
    /Promo sudah mencapai batas pemakaian/,
  )
})
