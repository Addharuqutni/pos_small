import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useActiveShift } from '@/queries/shifts'
import { useCheckoutSale } from '@/queries/sales'
import { priceSale, type PriceSaleInput } from '../../../api/src/lib/sale-pricing.ts'
import { formatCurrency } from '@/lib/utils'
import { Button, Input, Modal } from '@/components/ui'
import { Banknote, QrCode, ArrowRightLeft, X } from 'lucide-react'
import type { PaymentMethod, Sale } from '@/types'

const METHODS = [
  { method: 'cash' as const, icon: Banknote, label: 'Tunai', fieldLabel: 'Uang Diterima' },
  { method: 'qris' as const, icon: QrCode, label: 'QRIS', fieldLabel: 'Jumlah' },
  { method: 'transfer' as const, icon: ArrowRightLeft, label: 'Transfer', fieldLabel: 'Jumlah' },
]

export {
  draftAmount,
  draftAmounts,
  toPayments,
  MAX_REFERENCE_NO_LENGTH,
  type PaymentTender,
  type PaymentDraft,
} from './payment-tender.ts'
import {
  draftAmounts,
  toPayments,
  MAX_REFERENCE_NO_LENGTH,
  type PaymentDraft,
} from './payment-tender.ts'

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
