import type { PaymentMethod } from '@/types'
import type { PricingPayment } from '../../../api/src/lib/sale-pricing.ts'

/** POST /sales tender row; `referenceNo` is only sent when the field is filled. */
export type PaymentTender = PricingPayment & { referenceNo?: string }

/** One tender row of the modal; reference numbers are capped at 255 chars. */
export interface PaymentDraft {
  method: PaymentMethod
  /** Raw input text so the field can be emptied while typing. */
  amount: string
  /** True once the user typed in the amount; the row then stops following the balance. */
  manual: boolean
  referenceNo: string
}

export const MAX_REFERENCE_NO_LENGTH = 255

/** Parsed rupiah amount of a draft field ('' or garbage → 0). */
export function draftAmount(value: string): number {
  return Math.max(0, parseInt(value, 10) || 0)
}

/**
 * Effective rupiah amount per row. Cash and manually typed rows keep what was
 * entered; a non-cash row that has not been edited yet follows the balance still
 * uncovered by the other rows (clamped at 0), so picking QRIS alone lands on the
 * exact cart total in one click.
 */
export function draftAmounts(drafts: PaymentDraft[], grandTotal: number): number[] {
  const fixed = drafts.reduce(
    (sum, draft) => sum + (draft.method === 'cash' || draft.manual ? draftAmount(draft.amount) : 0),
    0,
  )
  let remaining = grandTotal - fixed
  return drafts.map((draft) => {
    if (draft.method === 'cash' || draft.manual) return draftAmount(draft.amount)
    const amount = Math.max(0, Math.round(remaining))
    remaining -= amount
    return amount
  })
}

/** Rows to POST: zero-amount rows dropped, blank reference numbers omitted. */
export function toPayments(drafts: PaymentDraft[], amounts: number[]): PaymentTender[] {
  return drafts.flatMap((draft, index) => {
    const amount = amounts[index] ?? 0
    if (amount <= 0) return []
    const referenceNo = draft.referenceNo.trim()
    return [referenceNo
      ? { method: draft.method, amount, referenceNo }
      : { method: draft.method, amount }]
  })
}
