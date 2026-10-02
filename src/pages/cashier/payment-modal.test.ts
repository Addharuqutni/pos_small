import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import {
  draftAmount,
  draftAmounts,
  toPayments,
  type PaymentDraft,
} from './payment-modal.js'

test('draftAmount parses positive integers and defaults to 0 for invalid inputs', () => {
  assert.equal(draftAmount('50000'), 50000)
  assert.equal(draftAmount('0'), 0)
  assert.equal(draftAmount(''), 0)
  assert.equal(draftAmount('-1000'), 0)
  assert.equal(draftAmount('abc'), 0)
  assert.equal(draftAmount('12.34'), 12)
})

test('draftAmounts: unedited non-cash row follows remaining uncovered balance', () => {
  // Scenario 1: Only QRIS selected (un-edited, manual: false) -> gets full grandTotal
  const drafts1: PaymentDraft[] = [
    { method: 'qris', amount: '', manual: false, referenceNo: '' },
  ]
  assert.deepEqual(draftAmounts(drafts1, 100_000), [100_000])

  // Scenario 2: Cash entered 40k, unedited QRIS gets the remaining 60k
  const drafts2: PaymentDraft[] = [
    { method: 'cash', amount: '40000', manual: true, referenceNo: '' },
    { method: 'qris', amount: '', manual: false, referenceNo: '' },
  ]
  assert.deepEqual(draftAmounts(drafts2, 100_000), [40_000, 60_000])

  // Scenario 3: Cash entered 120k (overpaid cash), remaining balance is clamped at 0
  const drafts3: PaymentDraft[] = [
    { method: 'cash', amount: '120000', manual: true, referenceNo: '' },
    { method: 'qris', amount: '', manual: false, referenceNo: '' },
  ]
  assert.deepEqual(draftAmounts(drafts3, 100_000), [120_000, 0])

  // Scenario 4: User manually entered QRIS amount (manual: true) -> keeps manual amount
  const drafts4: PaymentDraft[] = [
    { method: 'cash', amount: '30000', manual: true, referenceNo: '' },
    { method: 'qris', amount: '50000', manual: true, referenceNo: '' },
    { method: 'transfer', amount: '', manual: false, referenceNo: '' },
  ]
  assert.deepEqual(draftAmounts(drafts4, 100_000), [30_000, 50_000, 20_000])
})

test('toPayments filters out zero-amount rows and trims reference numbers', () => {
  const drafts: PaymentDraft[] = [
    { method: 'cash', amount: '50000', manual: true, referenceNo: '' },
    { method: 'qris', amount: '50000', manual: true, referenceNo: '  REF-12345  ' },
    { method: 'transfer', amount: '0', manual: false, referenceNo: 'UNUSED' },
  ]
  const amounts = [50_000, 50_000, 0]

  const payments = toPayments(drafts, amounts)
  assert.deepEqual(payments, [
    { method: 'cash', amount: 50_000 },
    { method: 'qris', amount: 50_000, referenceNo: 'REF-12345' },
  ])
})
