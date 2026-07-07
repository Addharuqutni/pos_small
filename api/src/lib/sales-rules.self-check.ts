import { strict as assert } from 'node:assert'
import { getLineDiscountError, getRefundQuantityError, lineSubtotal } from './sales-rules.js'

assert.equal(getLineDiscountError(10_000, 1_000, 'Kopi'), null)
assert.equal(lineSubtotal(10_000, 2, 1_000), 18_000)
assert.equal(
  getLineDiscountError(10_000, 10_001, 'Kopi'),
  'Discount exceeds item price for "Kopi"',
)
assert.equal(getRefundQuantityError(3, 1, 2), null)
assert.equal(
  getRefundQuantityError(3, 2, 2),
  'Refund qty exceeds remaining sale qty',
)

console.log('sales rules self-check passed')
