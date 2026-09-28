import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useActiveShift } from '@/queries/shifts'
import { useCheckoutSale } from '@/queries/sales'
import { priceSale, type PriceSaleInput } from '../../../api/src/lib/sale-pricing.ts'
import { formatCurrency } from '@/lib/utils'
import { Button, Input, Modal } from '@/components/ui'
import { Banknote, QrCode, ArrowRightLeft } from 'lucide-react'
import type { PaymentMethod, Sale } from '@/types'

const METHODS = [
  { method: 'cash' as const, icon: Banknote, label: 'Tunai' },
  { method: 'qris' as const, icon: QrCode, label: 'QRIS' },
  { method: 'transfer' as const, icon: ArrowRightLeft, label: 'Transfer' },
]

interface PaymentModalProps {
  open: boolean
  onClose: () => void
  /** Cart pricing input (no tender) — the modal adds the amount tendered. */
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
 * Payment panel: method picker, cash tender, shortfall guard and shift warning.
 * Amounts come from the shared pricing module priced with the tendered amount,
 * so the change shown is the same value checkout will store.
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
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [cashReceived, setCashReceived] = useState('')

  const { data: activeShift } = useActiveShift()
  const shiftOpen = !!activeShift

  const checkoutMutation = useCheckoutSale()

  const cashReceivedNum = Math.max(0, parseInt(cashReceived) || 0)
  const isCash = paymentMethod === 'cash'
  // Non-cash methods tender the exact cart total; `paid` doesn't affect totals.
  const cartPricing = useMemo(() => priceSale(pricingInput), [pricingInput])
  const paidAmount = isCash ? cashReceivedNum : cartPricing.grandTotal

  const pricing = useMemo(
    () => priceSale({ ...pricingInput, paid: paidAmount }),
    [pricingInput, paidAmount],
  )

  const underpaid = pricing.errors.some((error) => error.code === 'underpaid')
  const blocked = blockingErrors.length > 0
  const canSubmit = shiftOpen && pricing.grandTotal > 0 && !underpaid && !blocked

  const handleSubmit = () => {
    if (!canSubmit) return
    checkoutMutation.mutate(
      {
        items,
        payments: [{ method: paymentMethod, amount: paidAmount }],
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

        {/* Payment method */}
        <div>
          <p className="label">Metode Pembayaran</p>
          <div className="grid grid-cols-3 gap-2">
            {METHODS.map(({ method, icon: Icon, label }) => (
              <button
                key={method}
                onClick={() => setPaymentMethod(method)}
                className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border-2 p-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 ${
                  paymentMethod === method
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Icon className="h-6 w-6" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Cash input */}
        {isCash && (
          <div>
            <Input
              name="cash-received"
              label="Uang Diterima"
              type="number"
              min={pricing.grandTotal}
              value={cashReceived}
              onChange={(e) => setCashReceived(e.target.value)}
              autoFocus
            />
            {!underpaid && pricing.changeTotal > 0 && (
              <p className="mt-3 rounded-xl bg-green-50 p-3 text-center text-lg font-bold text-green-700">
                Kembalian: {formatCurrency(pricing.changeTotal)}
              </p>
            )}
          </div>
        )}

        {blocked && (
          <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
            {blockingErrors[0]!.message}
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
