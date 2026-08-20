import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import {
  getLineDiscountError,
  getRefundQuantityError,
  lineSubtotal,
  computePromoDiscount,
  getSaleDiscountError,
} from './sales-rules.js'

test('getLineDiscountError rejects discount above item price', () => {
  assert.equal(getLineDiscountError(10_000, 1_000, 'Kopi'), null)
  assert.equal(
    getLineDiscountError(10_000, 10_001, 'Kopi'),
    'Diskon melebihi harga item untuk "Kopi"',
  )
})

test('lineSubtotal applies per-unit discount then multiplies by qty', () => {
  assert.equal(lineSubtotal(10_000, 2, 1_000), 18_000)
  assert.equal(lineSubtotal(10_000, 1, 0), 10_000)
})

test('getRefundQuantityError checks remaining refundable qty', () => {
  assert.equal(getRefundQuantityError(3, 1, 2), null)
  assert.equal(getRefundQuantityError(3, 1, 1), null)
  assert.equal(
    getRefundQuantityError(3, 2, 2),
    'Jumlah refund melebihi sisa qty penjualan',
  )
})

test('computePromoDiscount percent rounds and respects cap and subtotal', () => {
  assert.equal(computePromoDiscount('percent', 10, 100_000, null), 10_000)
  assert.equal(computePromoDiscount('percent', 50, 100_000, 20_000), 20_000)
  assert.equal(computePromoDiscount('percent', 50, 100_000, null), 50_000)
  assert.equal(computePromoDiscount('percent', 90, 100_000, null), 90_000)
  assert.equal(computePromoDiscount('percent', 200, 100_000, null), 100_000)
})

test('computePromoDiscount amount never exceeds subtotal', () => {
  assert.equal(computePromoDiscount('amount', 15_000, 100_000, null), 15_000)
  assert.equal(computePromoDiscount('amount', 150_000, 100_000, null), 100_000)
})

test('getSaleDiscountError checks sale-level discount', () => {
  assert.equal(getSaleDiscountError(50_000, 10_000), null)
  assert.equal(getSaleDiscountError(10_000, 10_001), 'Diskon penjualan melebihi subtotal')
})
