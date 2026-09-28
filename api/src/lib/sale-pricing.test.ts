import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import {
  computePromoDiscount,
  getRefundQuantityError,
  lineSubtotal,
  priceSale,
  refundLineAmount,
} from './sale-pricing.js'

test('priceSale computes whole-sale totals', () => {
  const result = priceSale({
    lines: [
      { price: 10_000, qty: 2, discount: 1_000, name: 'Kopi' },
      { price: 25_000, qty: 1, discount: 0, name: 'Kue' },
    ],
    taxRate: 11,
    paid: 50_000,
  })

  assert.equal(result.lines.length, 2)
  assert.deepEqual(result.lines[0], {
    price: 10_000, qty: 2, discount: 1_000,
    gross: 20_000, discountTotal: 2_000, net: 18_000,
  })
  assert.equal(result.subtotal, 43_000)
  assert.equal(result.lineDiscountTotal, 2_000)
  assert.equal(result.promoDiscount, 0)
  assert.equal(result.saleDiscount, 0)
  assert.equal(result.taxable, 43_000)
  assert.equal(result.taxTotal, 4_730)
  assert.equal(result.grandTotal, 47_730)
  assert.equal(result.discountTotal, 2_000)
  assert.equal(result.paidTotal, 50_000)
  assert.equal(result.changeTotal, 2_270)
  assert.deepEqual(result.errors, [])
  assert.equal(result.ok, true)
})

test('priceSale applies promo percent with maxDiscount cap and sale discount', () => {
  const result = priceSale({
    lines: [{ price: 100_000, qty: 1, discount: 0 }],
    promo: { type: 'percent', value: 50, maxDiscount: 20_000 },
    saleDiscount: 5_000,
    taxRate: 10,
    paid: 80_000,
  })

  assert.equal(result.subtotal, 100_000)
  assert.equal(result.promoDiscount, 20_000)
  assert.equal(result.saleDiscount, 5_000)
  assert.equal(result.taxable, 75_000)
  assert.equal(result.taxTotal, 7_500)
  assert.equal(result.grandTotal, 82_500)
  assert.equal(result.discountTotal, 25_000)
  assert.equal(result.changeTotal, 0)
  assert.deepEqual(
    result.errors.map((e) => e.code),
    ['underpaid'],
  )
  assert.equal(result.errors[0]?.message, 'Pembayaran kurang: butuh 82500, diterima 80000')
  assert.equal(result.ok, false)
})

test('priceSale clamps promo amount to subtotal and sale discount to remaining total', () => {
  const result = priceSale({
    lines: [{ price: 40_000, qty: 1, discount: 0 }],
    promo: { type: 'amount', value: 150_000 },
    saleDiscount: 1,
    taxRate: 0,
  })

  assert.equal(result.promoDiscount, 40_000)
  assert.equal(result.taxable, -1)
  assert.equal(result.grandTotal, -1)
  assert.deepEqual(
    result.errors.map((e) => e.code),
    ['sale_discount_exceeds_total'],
  )
})

test('priceSale reports promo min purchase without applying the promo', () => {
  const result = priceSale({
    lines: [{ price: 30_000, qty: 1, discount: 0 }],
    promo: { type: 'percent', value: 10, minPurchase: 50_000 },
    saleDiscount: 2_000,
    taxRate: 0,
  })

  assert.equal(result.promoDiscount, 0)
  assert.equal(result.saleDiscount, 2_000)
  assert.equal(result.subtotal, 30_000)
  assert.equal(result.taxable, 28_000)
  assert.deepEqual(
    result.errors.map((e) => e.code),
    ['promo_min_purchase'],
  )
  assert.equal(result.errors[0]?.message, 'Minimal belanja untuk promo ini 50000')
})

test('priceSale rounds tax to the nearest minor unit', () => {
  const result = priceSale({
    lines: [{ price: 3_333, qty: 1, discount: 0 }],
    taxRate: 11,
  })

  assert.equal(result.taxable, 3_333)
  assert.equal(result.taxTotal, 367) // 366.63 -> 367
  assert.equal(result.grandTotal, 3_700)
})

test('priceSale flags a per-unit discount above the unit price', () => {
  const result = priceSale({
    lines: [
      { price: 10_000, qty: 2, discount: 0, name: 'Kopi' },
      { price: 5_000, qty: 1, discount: 5_001, name: 'Teh' },
    ],
    taxRate: 0,
  })

  assert.equal(result.errors.length, 1)
  assert.equal(result.errors[0]?.code, 'line_discount_exceeds_price')
  assert.equal(result.errors[0]?.lineIndex, 1)
  assert.equal(result.errors[0]?.message, 'Diskon melebihi harga item untuk "Teh"')
  assert.equal(result.subtotal, 20_000 - 1)
})

test('priceSale reports sale discount above the promo-reduced subtotal', () => {
  const result = priceSale({
    lines: [{ price: 50_000, qty: 1, discount: 0 }],
    promo: { type: 'amount', value: 10_000 },
    saleDiscount: 40_001,
    taxRate: 0,
  })

  assert.equal(result.errors[0]?.code, 'sale_discount_exceeds_total')
  assert.equal(result.errors[0]?.message, 'Diskon penjualan melebihi subtotal')
})

test('priceSale skips the underpayment check when paid is omitted', () => {
  const result = priceSale({ lines: [{ price: 10_000, qty: 1, discount: 0 }], taxRate: 0 })

  assert.equal(result.paidTotal, 0)
  assert.equal(result.changeTotal, 0)
  assert.deepEqual(result.errors, [])
  assert.equal(result.ok, true)
})

test('priceSale reports exact change and refuses negative change', () => {
  const exact = priceSale({
    lines: [{ price: 45_000, qty: 1, discount: 0 }],
    taxRate: 0,
    paid: 45_000,
  })
  assert.equal(exact.changeTotal, 0)
  assert.equal(exact.ok, true)

  const overpaid = priceSale({
    lines: [{ price: 45_000, qty: 1, discount: 0 }],
    taxRate: 0,
    paid: 100_000,
  })
  assert.equal(overpaid.changeTotal, 55_000)
})

test('lineSubtotal applies per-unit discount then multiplies by qty', () => {
  assert.equal(lineSubtotal(10_000, 2, 1_000), 18_000)
  assert.equal(lineSubtotal(10_000, 1, 0), 10_000)
})

test('refundLineAmount rounds the refunded line net', () => {
  assert.equal(refundLineAmount(10_000, 2, 1_000), 18_000)
  assert.equal(refundLineAmount(3_333, 1, 0), 3_333)
  assert.equal(refundLineAmount(10_000, 1, 0), 10_000)
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
