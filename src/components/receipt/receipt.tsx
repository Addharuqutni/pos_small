import { formatCurrency, formatDate } from '@/lib/utils'
import type { Sale, StoreSettings } from '@/types'

interface ReceiptProps {
  sale: Sale
  settings: StoreSettings | null
  copy?: boolean
}

/** PRD §9.12 — Receipt for print. CSS in index.css handles @media print */
export function Receipt({ sale, settings, copy }: ReceiptProps) {
  return (
    <div className="receipt-print mx-auto max-w-[300px] font-mono text-xs leading-relaxed">
      {/* Header */}
      <div className="text-center">
        <p className="text-sm font-bold">{settings?.storeName ?? 'Toko'}</p>
        {settings?.storeAddress && <p>{settings.storeAddress}</p>}
        {settings?.storePhone && <p>Telp: {settings.storePhone}</p>}
      </div>

      <hr className="my-2 border-dashed border-slate-400" />

      <div className="flex justify-between">
        <span>No: {sale.invoiceNo}</span>
        {copy && <span className="font-bold">[COPY]</span>}
      </div>
      <p>{formatDate(sale.createdAt)}</p>
      <p>Kasir: {sale.cashier?.name ?? '-'}</p>

      <hr className="my-2 border-dashed border-slate-400" />

      {/* Items */}
      <table className="w-full">
        <tbody>
          {sale.items.map((item) => (
            <tr key={item.id}>
              <td colSpan={2} className="pt-1">
                <p>{item.productNameSnapshot}</p>
                <div className="flex justify-between text-slate-500">
                  <span>{item.qty} x {formatCurrency(item.price)}</span>
                  <span>{formatCurrency(item.subtotal)}</span>
                </div>
                {item.discount > 0 && (
                  <div className="flex justify-between text-slate-500">
                    <span>Disk.</span>
                    <span>-{formatCurrency(item.discount * item.qty)}</span>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <hr className="my-2 border-dashed border-slate-400" />

      {/* Totals */}
      <div className="space-y-0.5">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatCurrency(sale.subtotal)}</span>
        </div>
        {sale.discountTotal > 0 && (
          <div className="flex justify-between">
            <span>Diskon</span>
            <span>-{formatCurrency(sale.discountTotal)}</span>
          </div>
        )}
        {sale.taxTotal > 0 && (
          <div className="flex justify-between">
            <span>Pajak</span>
            <span>{formatCurrency(sale.taxTotal)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-sm">
          <span>TOTAL</span>
          <span>{formatCurrency(sale.grandTotal)}</span>
        </div>
      </div>

      <hr className="my-2 border-dashed border-slate-400" />

      {/* Payment */}
      {sale.payments.map((p) => (
        <div key={p.id} className="flex justify-between">
          <span className="capitalize">{p.method}</span>
          <span>{formatCurrency(p.amount)}</span>
        </div>
      ))}
      {sale.changeTotal > 0 && (
        <div className="flex justify-between font-bold">
          <span>Kembalian</span>
          <span>{formatCurrency(sale.changeTotal)}</span>
        </div>
      )}

      <hr className="my-2 border-dashed border-slate-400" />

      {/* Footer */}
      <p className="text-center text-slate-500">
        {settings?.receiptFooter ?? 'Terima kasih atas kunjungan Anda'}
      </p>
    </div>
  )
}
