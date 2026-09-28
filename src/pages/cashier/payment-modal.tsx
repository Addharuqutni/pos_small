import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useActiveShift } from '@/queries/shifts'
import { useCheckoutSale } from '@/queries/sales'
import { priceSale, type PriceSaleInput, type PricingPayment } from '../../../api/src/lib/sale-pricing.ts'
import { formatCurrency } from '@/lib/utils'
import { Button, Input, Modal } from '@/components/ui'
import { Banknote, QrCode, ArrowRightLeft, X } from 'lucide-react'
import type { PaymentMethod, Sale } from '@/types'

const METHODS = [
  { method: 'cash' as const, icon: Banknote, label: 'Tunai', fieldLabel: 'Uang Diterima' },
  { method: 'qris' as const, icon: QrCode, label: 'QRIS', fieldLabel: 'Jumlah' },
  { method: 'transfer' as const, icon: ArrowRightLeft, label: 'Transfer', fieldLabel: 'Jumlah' },
]

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

interface PaymentModalProps {
  open: boolean
  onClose: () => void
  /** Cart pricing input (no tender) — the modal adds the tender rows. */
  pricingInput: PriceSaleInput
  /** POST /sales payload lines. */
  items: { productId: string; qty: number; discount: number }[]
  saleDiscount: number
  promoCode: string | undefined
  /** Errors from pricing the cart without a tender (`underpaid` excluded). */
  blockingErrors: { message: string }[]
  onCheckoutSuccess: (sale: Sale) => void
}

/**
 * Payment panel: up to one tender row per method (Tunai/QRIS/Transfer), shortfall
 * guard and shift warning. Amounts and errors come from the shared pricing module
 * priced with all tender rows, so the change shown is what checkout will store.
 */
export function PaymentModal({
  open,
  onClose,
  pricingInput,
  items,
  saleDiscount,
  promoCode,
  blockingErrors,
  onCheckoutSuccess,
}: PaymentModalProps) {
  const navigate = useNavigate()
  // Cash first by default; the tiles add (or select) the other methods.
  const [drafts, setDrafts] = useState<PaymentDraft[]>([
    { method: 'cash', amount: '', manual: false, referenceNo: '' },
  ])

  const { data: activeShift } = useActiveShift()
  const shiftOpen = !!activeShift

  const checkoutMutation = useCheckoutSale()

  // Cart totals never depend on the tender; price once for the row balances.
  const cartPricing = useMemo(() => priceSale(pricingInput), [pricingInput])
  const grandTotal = cartPricing.grandTotal

  const amounts = useMemo(() => draftAmounts(drafts, grandTotal), [drafts, grandTotal])
  const payments = useMemo(() => toPayments(drafts, amounts), [drafts, amounts])

  const pricing = useMemo(
    () => priceSale({ ...pricingInput, payments }),
    [pricingInput, payments],
  )

  const paymentErrors = pricing.errors.filter(
    (error) =>
      error.code === 'underpaid'
      || error.code === 'non_cash_exceeds_total'
      || error.code === 'duplicate_payment_method',
  )
  const paymentError = paymentErrors[0]
  const shortfall = paymentError?.code === 'underpaid'
    ? Math.max(0, pricing.grandTotal - pricing.paidTotal)
    : 0
  const blocked = blockingErrors.length > 0
  const canSubmit = shiftOpen && pricing.grandTotal > 0 && !paymentError && !blocked && payments.length > 0
  const alertMessage = blocked ? blockingErrors[0]!.message : paymentError?.message

  const updateDraft = (index: number, patch: Partial<PaymentDraft>) => {
    setDrafts((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  /** Adds the method's row when missing (one row per method); clicking again is a no-op. */
  const addMethod = (method: PaymentMethod) => {
    setDrafts((rows) => rows.some((row) => row.method === method)
      ? rows
      : [...rows, { method, amount: '', manual: false, referenceNo: '' }])
  }

  const removeDraft = (index: number) => {
    setDrafts((rows) => rows.filter((_, i) => i !== index))
  }

  const handleSubmit = () => {
    if (!canSubmit) return
    checkoutMutation.mutate(
      {
        items,
        payments: payments.map(({ method, amount, referenceNo }) =>
          referenceNo ? { method, amount, referenceNo } : { method, amount }),
        discount: saleDiscount,
        promoCode,
      },
      { onSuccess: onCheckoutSuccess },
    )
  }

  return (
    <Modal open={open} onClose={onClose} title="Pembayaran" className="max-w-md">
      <div className="space-y-5">
        <div className="rounded-xl bg-primary-50 p-5 text-center">
          <p className="text-sm font-medium text-primary-600">Total Bayar</p>
          <p className="mt-1 text-3xl font-black text-primary-900">{formatCurrency(pricing.grandTotal)}</p>
        </div>

        {/* Payment methods — tiles add one row per method */}
        <div>
          <p className="label">Metode Pembayaran</p>
          <div className="grid grid-cols-3 gap-2">
            {METHODS.map(({ method, icon: Icon, label }) => {
              const selected = drafts.some((draft) => draft.method === method)
              return (
                <button
                  key={method}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => addMethod(method)}
                  className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border-2 p-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 ${
                    selected
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="h-6 w-6" />
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Tender rows */}
        <div className="space-y-3">
          {drafts.map((draft, index) => {
            const meta = METHODS.find((entry) => entry.method === draft.method)!
            const Icon = meta.icon
            const isCash = draft.method === 'cash'
            const rowAmount = isCash || draft.manual ? draft.amount : String(amounts[index] ?? 0)

            return (
              <div key={draft.method} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <Icon className="h-4 w-4" />
                    {meta.label}
                  </span>
                  {!isCash && (
                    <button
                      type="button"
                      onClick={() => removeDraft(index)}
                      className="icon-button h-8 w-8"
                      aria-label={`Hapus pembayaran ${meta.label}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="mt-2 space-y-2">
                  <Input
                    name={`payment-amount-${draft.method}`}
                    label={meta.fieldLabel}
                    type="number"
                    min={0}
                    value={rowAmount}
                    onChange={(e) => updateDraft(index, { amount: e.target.value, manual: e.target.value !== '' })}
                    autoFocus={isCash}
                  />
                  {!isCash && (
                    <Input
                      name={`payment-reference-${draft.method}`}
                      label="No. referensi"
                      type="text"
                      maxLength={MAX_REFERENCE_NO_LENGTH}
                      placeholder="Opsional"
                      value={draft.referenceNo}
                      onChange={(e) => updateDraft(index, { referenceNo: e.target.value })}
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {shortfall > 0 && (
          <p className="rounded-xl bg-amber-50 p-3 text-center text-lg font-bold text-amber-800" role="alert">
            Sisa tagihan: {formatCurrency(shortfall)}
          </p>
        )}

        {!paymentError && pricing.changeTotal > 0 && (
          <p className="rounded-xl bg-green-50 p-3 text-center text-lg font-bold text-green-700">
            Kembalian: {formatCurrency(pricing.changeTotal)}
          </p>
        )}

        {alertMessage && (
          <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
            {alertMessage}
          </p>
        )}

        {!shiftOpen && (
          <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
            Shift belum dibuka. Buka shift sebelum transaksi.
            <button
              type="button"
              className="ml-2 font-semibold underline"
              onClick={() => navigate('/cashier/shift/open')}
            >
              Buka shift
            </button>
          </div>
        )}

        <Button
          className="h-12 w-full rounded-xl font-bold"
          size="lg"
          variant="success"
          loading={checkoutMutation.isPending}
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          Simpan Transaksi
        </Button>

        {checkoutMutation.isError && (
          <p className="text-center text-sm text-red-600">
            {checkoutMutation.error instanceof Error ? checkoutMutation.error.message : 'Gagal menyimpan transaksi'}
          </p>
        )}
      </div>
    </Modal>
  )
}
