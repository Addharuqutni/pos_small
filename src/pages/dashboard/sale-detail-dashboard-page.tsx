import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Button, Modal, Input, PageSpinner } from '@/components/ui'
import { Receipt } from '@/components/receipt/receipt'
import type { Sale, StoreSettings, PaymentMethod } from '@/types'
import { saleStatusLabels, saleStatusBadgeClass, paymentMethodLabels } from '@/types'

interface RefundFormItem {
  saleItemId: string
  productName: string
  maxQty: number
  qty: number
  checked: boolean
}

export function SaleDetailDashboardPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [showRefundModal, setShowRefundModal] = useState(false)
  const [refundItems, setRefundItems] = useState<RefundFormItem[]>([])
  const [refundReason, setRefundReason] = useState('')

  const { data: sale, isLoading } = useQuery({
    queryKey: queryKeys.sales.detail(id!),
    queryFn: () => api.get<Sale>(`/sales/${id}`),
    enabled: !!id,
  })

  const { data: settings } = useQuery({
    queryKey: queryKeys.settings.all,
    queryFn: () => api.get<StoreSettings>('/settings'),
  })

  const invalidateSaleMutationCaches = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.sales.all })
    queryClient.invalidateQueries({ queryKey: queryKeys.products.all })
    queryClient.invalidateQueries({ queryKey: queryKeys.stock.movements({}) })
    queryClient.invalidateQueries({ queryKey: queryKeys.reports.sales() })
    queryClient.invalidateQueries({ queryKey: queryKeys.reports.lowStock() })
    queryClient.invalidateQueries({ queryKey: queryKeys.reports.shifts() })
  }

  const voidMutation = useMutation({
    mutationFn: () => api.post(`/sales/${id}/void`),
    onSuccess: () => {
      invalidateSaleMutationCaches()
      navigate('/dashboard/sales')
    },
  })

  const refundMutation = useMutation({
    mutationFn: (body: { reason: string; items: { saleItemId: string; qty: number }[] }) =>
      api.post(`/sales/${id}/refund`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sales.detail(id!) })
      invalidateSaleMutationCaches()
      setShowRefundModal(false)
      setRefundReason('')
    },
  })

  function handleVoid() {
    if (!confirm('Yakin ingin void transaksi ini? Tindakan ini tidak dapat dibatalkan.')) return
    voidMutation.mutate()
  }

  function openRefundModal() {
    if (!sale) return
    // Tally already-refunded qty per sale item so the max reflects what is
    // still refundable, not the original sold qty.
    const refundedQtyByItem = new Map<string, number>()
    for (const refund of sale.refunds ?? []) {
      for (const ri of refund.items) {
        refundedQtyByItem.set(ri.saleItemId, (refundedQtyByItem.get(ri.saleItemId) ?? 0) + ri.qty)
      }
    }
    setRefundItems(
      sale.items.map((item) => {
        const alreadyRefunded = refundedQtyByItem.get(item.id) ?? 0
        const maxQty = item.qty - alreadyRefunded
        return {
          saleItemId: item.id,
          productName: item.productNameSnapshot,
          maxQty,
          qty: Math.max(1, maxQty),
          // Auto-skip items with nothing left to refund.
          checked: false,
        }
      }).filter((i) => i.maxQty > 0)
    )
    setRefundReason('')
    setShowRefundModal(true)
  }

  function handleRefundSubmit() {
    const selected = refundItems.filter((i) => i.checked && i.qty > 0)
    if (selected.length === 0) return
    refundMutation.mutate({
      reason: refundReason,
      items: selected.map((i) => ({ saleItemId: i.saleItemId, qty: i.qty })),
    })
  }

  if (isLoading) return <PageSpinner />
  if (!sale) return <div className="p-6 text-center text-slate-400">Transaksi tidak ditemukan</div>

  const st = {
    label: saleStatusLabels[sale.status],
    class: saleStatusBadgeClass[sale.status],
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Detail Transaksi</h1>
          <p className="text-sm text-slate-500">Invoice {sale.invoiceNo}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => navigate('/dashboard/sales')}>
            ← Kembali
          </Button>
          {sale.status === 'paid' && (
            <>
              <Button variant="danger" onClick={handleVoid} disabled={voidMutation.isPending}>
                {voidMutation.isPending ? 'Memproses…' : 'Void'}
              </Button>
              <Button variant="secondary" onClick={openRefundModal}>
                Refund
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Sale info */}
        <div className="space-y-4">
          {/* Info card */}
          <div className="card">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-500">Invoice</span>
                <p className="font-mono font-medium">{sale.invoiceNo}</p>
              </div>
              <div>
                <span className="text-slate-500">Waktu</span>
                <p>{formatDate(sale.createdAt)}</p>
              </div>
              <div>
                <span className="text-slate-500">Kasir</span>
                <p>{sale.cashier?.name ?? '-'}</p>
              </div>
              <div>
                <span className="text-slate-500">Status</span>
                <p>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${st.class}`}>
                    {st.label}
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* Items table */}
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left">
                  <th className="px-4 py-3 font-medium text-slate-600">Produk</th>
                  <th className="px-4 py-3 font-medium text-slate-600 text-center">Qty</th>
                  <th className="px-4 py-3 font-medium text-slate-600 text-right">Harga</th>
                  <th className="px-4 py-3 font-medium text-slate-600 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {sale.items.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100">
                    <td className="px-4 py-3">{item.productNameSnapshot}</td>
                    <td className="px-4 py-3 text-center">{item.qty}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatCurrency(item.price)}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatCurrency(item.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50">
                <tr className="border-t border-slate-200">
                  <td colSpan={3} className="px-4 py-2 text-right font-medium text-slate-600">Subtotal</td>
                  <td className="px-4 py-2 text-right font-mono">{formatCurrency(sale.subtotal)}</td>
                </tr>
                {sale.discountTotal > 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-2 text-right font-medium text-slate-600">Diskon</td>
                    <td className="px-4 py-2 text-right font-mono text-red-600">-{formatCurrency(sale.discountTotal)}</td>
                  </tr>
                )}
                {sale.taxTotal > 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-2 text-right font-medium text-slate-600">Pajak</td>
                    <td className="px-4 py-2 text-right font-mono">{formatCurrency(sale.taxTotal)}</td>
                  </tr>
                )}
                <tr className="border-t border-slate-300 font-bold">
                  <td colSpan={3} className="px-4 py-3 text-right">Grand Total</td>
                  <td className="px-4 py-3 text-right font-mono">{formatCurrency(sale.grandTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Payments */}
          <div className="card">
            <h3 className="mb-3 font-semibold text-slate-800">Pembayaran</h3>
            <div className="space-y-2 text-sm">
              {sale.payments.map((p) => (
                <div key={p.id} className="flex justify-between">
                  <span className="text-slate-600">{paymentMethodLabels[p.method as PaymentMethod]}</span>
                  <span className="font-mono">{formatCurrency(p.amount)}</span>
                </div>
              ))}
              {sale.changeTotal > 0 && (
                <div className="flex justify-between border-t pt-2 text-slate-500">
                  <span>Kembalian</span>
                  <span className="font-mono">{formatCurrency(sale.changeTotal)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Existing refunds */}
          {sale.refunds && sale.refunds.length > 0 && (
            <div className="card">
              <h3 className="mb-3 font-semibold text-slate-800">Riwayat Refund</h3>
              <div className="space-y-4">
                {sale.refunds.map((refund) => (
                  <div key={refund.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                    <div className="mb-2 flex justify-between text-xs text-slate-500">
                      <span>{formatDate(refund.createdAt)}</span>
                      <span>Alasan: {refund.reason || '-'}</span>
                    </div>
                    {refund.items.map((ri) => {
                      const saleItem = sale.items.find((si) => si.id === ri.saleItemId)
                      return (
                        <div key={ri.id} className="flex justify-between">
                          <span>{saleItem?.productNameSnapshot ?? 'Produk'} × {ri.qty}</span>
                          <span className="font-mono">{formatCurrency(ri.amount)}</span>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Receipt preview */}
        <div className="card h-fit">
          <Receipt sale={sale} settings={settings ?? null} copy />
        </div>
      </div>

      {/* Refund Modal */}
      <Modal open={showRefundModal} onClose={() => setShowRefundModal(false)} title="Refund Transaksi">
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Pilih item yang direfund:</label>
            {refundItems.map((item, idx) => (
              <div key={item.saleItemId} className="flex items-center gap-3 rounded border p-2">
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={(e) => {
                    setRefundItems((prev) =>
                      prev.map((it, i) => (i === idx ? { ...it, checked: e.target.checked } : it))
                    )
                  }}
                  className="h-4 w-4 rounded border-slate-300"
                  aria-label={`Refund ${item.productName}`}
                />
                <span className="flex-1 text-sm">{item.productName}</span>
                <Input
                  type="number"
                  min={1}
                  max={item.maxQty}
                  value={item.qty}
                  onChange={(e) => {
                    setRefundItems((prev) =>
                      prev.map((it, i) =>
                        i === idx ? { ...it, qty: Math.min(Number(e.target.value) || 1, item.maxQty) } : it
                      )
                    )
                  }}
                  disabled={!item.checked}
                  className="w-20 text-center"
                  aria-label={`Qty refund ${item.productName}`}
                />
                <span className="text-xs text-slate-400">/ {item.maxQty}</span>
              </div>
            ))}
          </div>
          <div>
            <label htmlFor="refund-reason" className="mb-1 block text-sm font-medium text-slate-700">Alasan refund</label>
            <textarea
              id="refund-reason"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              rows={3}
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder="Masukkan alasan refund..."
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowRefundModal(false)}>
              Batal
            </Button>
            <Button
              onClick={handleRefundSubmit}
              disabled={refundMutation.isPending || refundItems.every((i) => !i.checked)}
            >
              {refundMutation.isPending ? 'Memproses…' : 'Proses Refund'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
