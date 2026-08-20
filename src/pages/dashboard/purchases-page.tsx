import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Button, Input, Select, Modal, PageHeader, TableSkeleton, ErrorState } from '@/components/ui'
import { Plus, Trash2, ShoppingCart } from 'lucide-react'
import type { Purchase, Supplier, Product, PaginatedResponse } from '@/types'

interface PurchaseLine {
  productId: string
  qty: string
  costPrice: string
}

const emptyLine: PurchaseLine = { productId: '', qty: '1', costPrice: '' }

export function PurchasesPage() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [supplierId, setSupplierId] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<PurchaseLine[]>([{ ...emptyLine }])

  const { data: purchases, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.purchases.list(),
    queryFn: () => api.get<Purchase[]>('/purchases'),
  })

  const { data: suppliers } = useQuery({
    queryKey: queryKeys.suppliers.list(),
    queryFn: () => api.get<Supplier[]>('/suppliers'),
  })

  const { data: productsData } = useQuery({
    queryKey: queryKeys.products.list({ active: true }),
    queryFn: () => api.get<PaginatedResponse<Product>>('/products?active=true&limit=100'),
    enabled: showForm,
  })

  const saveMutation = useMutation({
    mutationFn: () =>
      api.post('/purchases', {
        supplierId: supplierId || null,
        notes: notes || null,
        items: lines.map((l) => ({
          productId: l.productId,
          qty: Number(l.qty),
          costPrice: Number(l.costPrice),
        })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchases.list() })
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.stock.movements({}) })
      closeForm()
    },
  })

  const products = productsData?.data ?? []
  const productOptions = products.map((p) => ({ value: p.id, label: `${p.name} (stok ${p.stock})` }))

  const updateLine = (index: number, patch: Partial<PurchaseLine>) => {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  }

  const addLine = () => setLines((prev) => [...prev, { ...emptyLine }])

  const removeLine = (index: number) => {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  const onProductChange = (index: number, productId: string) => {
    const product = products.find((p) => p.id === productId)
    updateLine(index, { productId, costPrice: product ? String(product.costPrice) : '' })
  }

  const totalCost = lines.reduce((sum, l) => sum + (Number(l.qty) || 0) * (Number(l.costPrice) || 0), 0)

  const canSave = lines.length > 0
    && lines.every((l) => l.productId && Number(l.qty) > 0 && Number(l.costPrice) >= 0)
    && saveMutation.isPending === false

  const openForm = () => {
    setSupplierId('')
    setNotes('')
    setLines([{ ...emptyLine }])
    setShowForm(true)
  }

  const closeForm = () => setShowForm(false)

  const supplierOptions = suppliers?.map((s) => ({ value: s.id, label: s.name })) ?? []

  return (
    <div>
      <PageHeader title="Pembelian (Stok Masuk)" subtitle="Catat pembelian barang dari supplier">
        <Button onClick={openForm}>
          <Plus className="h-4 w-4" /> Tambah Pembelian
        </Button>
      </PageHeader>

      {isLoading ? (
        <TableSkeleton rows={6} />
      ) : isError ? (
        <ErrorState message="Gagal memuat pembelian." onRetry={() => refetch()} />
      ) : (
        <div className="table-shell">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left">
                <th className="px-4 py-3 font-medium text-slate-600">No. Faktur</th>
                <th className="px-4 py-3 font-medium text-slate-600">Supplier</th>
                <th className="px-4 py-3 font-medium text-slate-600">Petugas</th>
                <th className="px-4 py-3 font-medium text-slate-600 text-right">Total</th>
                <th className="px-4 py-3 font-medium text-slate-600">Tanggal</th>
              </tr>
            </thead>
            <tbody>
              {purchases?.map((purchase) => (
                <tr key={purchase.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono font-semibold text-primary-700">{purchase.invoiceNo}</td>
                  <td className="px-4 py-3 text-slate-900">{purchase.supplierName || '-'}</td>
                  <td className="px-4 py-3 text-slate-500">{purchase.createdByName || '-'}</td>
                  <td className="px-4 py-3 text-right font-mono font-medium">{formatCurrency(purchase.totalCost)}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(purchase.createdAt)}</td>
                </tr>
              ))}
              {(!purchases || purchases.length === 0) && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                    <ShoppingCart className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                    Belum ada pembelian
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showForm} onClose={closeForm} title="Tambah Pembelian" className="max-w-2xl">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Supplier (opsional)"
              options={supplierOptions}
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              placeholder="Tanpa supplier"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">Item Pembelian</span>
              <Button type="button" variant="secondary" size="sm" onClick={addLine}>
                <Plus className="h-4 w-4" /> Item
              </Button>
            </div>

            {lines.map((line, index) => (
              <div key={index} className="grid grid-cols-[1fr_80px_120px_36px] items-end gap-2">
                <Select
                  label={index === 0 ? 'Produk' : undefined}
                  options={productOptions}
                  value={line.productId}
                  onChange={(e) => onProductChange(index, e.target.value)}
                  placeholder="Pilih produk"
                />
                <Input
                  label={index === 0 ? 'Jumlah' : undefined}
                  type="number"
                  min={1}
                  value={line.qty}
                  onChange={(e) => updateLine(index, { qty: e.target.value })}
                />
                <Input
                  label={index === 0 ? 'Harga Modal' : undefined}
                  type="number"
                  min={0}
                  value={line.costPrice}
                  onChange={(e) => updateLine(index, { costPrice: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => removeLine(index)}
                  className="mb-1 flex h-10 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                  aria-label="Hapus item"
                  disabled={lines.length === 1}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <div>
            <label htmlFor="purchase-notes" className="mb-1 block text-sm font-medium text-slate-700">Catatan</label>
            <textarea id="purchase-notes" className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
            <span className="text-sm text-slate-600">Total Biaya</span>
            <span className="font-mono text-lg font-bold text-slate-900">{formatCurrency(totalCost)}</span>
          </div>

          {saveMutation.isError && (
            <p className="text-sm text-red-600" role="alert">
              {saveMutation.error instanceof Error ? saveMutation.error.message : 'Gagal menyimpan pembelian'}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={closeForm}>Batal</Button>
            <Button type="button" onClick={() => saveMutation.mutate()} disabled={!canSave} loading={saveMutation.isPending}>
              Simpan Pembelian
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
