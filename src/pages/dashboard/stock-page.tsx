import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useActiveProducts, useAdjustStock, useStockMovements } from '@/queries/stock'
import { formatDate } from '@/lib/utils'
import { Button, Input, Select, Modal, PageHeader, TableSkeleton, StatusBadge, ErrorState } from '@/components/ui'
import { Plus } from 'lucide-react'
import { stockMovementTypeLabels } from '@/types'

const adjustSchema = z.object({
  productId: z.string().min(1, 'Pilih produk'),
  type: z.enum(['adjustment', 'restock'], { required_error: 'Pilih tipe' }),
  qtyChange: z.coerce.number().int().refine((v) => v !== 0, 'Jumlah tidak boleh 0'),
  notes: z.string().optional(),
})

type AdjustForm = z.infer<typeof adjustSchema>

const typeOptions = [
  { value: 'adjustment', label: 'Koreksi' },
  { value: 'restock', label: 'Restok' },
]

export function StockPage() {
  const [showForm, setShowForm] = useState(false)

  const { data, isLoading, isError, refetch } = useStockMovements()

  const { data: productsData } = useActiveProducts({ enabled: showForm })

  const adjustMutation = useAdjustStock()

  const { register, handleSubmit, reset, formState: { errors } } = useForm<AdjustForm>({
    resolver: zodResolver(adjustSchema),
  })

  const openForm = () => {
    reset({ productId: '', type: 'adjustment', qtyChange: 0, notes: '' })
    setShowForm(true)
  }

  const closeForm = () => setShowForm(false)

  const onSubmit = (data: AdjustForm) => {
    adjustMutation.mutate(data, { onSuccess: closeForm })
  }

  const productOptions = (productsData?.data ?? []).map((p) => ({
    value: p.id,
    label: p.name,
  }))

  if (isLoading) return <TableSkeleton rows={7} />
  if (isError) return <ErrorState message="Gagal memuat riwayat stok." onRetry={() => refetch()} />

  return (
    <div>
      <PageHeader title="Stok" subtitle="Riwayat pergerakan stok">
        <Button onClick={openForm}>
          <Plus className="h-4 w-4" />
          Koreksi Stok
        </Button>
      </PageHeader>

      <div className="table-shell">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left">
              <th className="px-4 py-3 font-medium text-slate-600">Waktu</th>
              <th className="px-4 py-3 font-medium text-slate-600">Produk</th>
              <th className="px-4 py-3 font-medium text-slate-600">Tipe</th>
              <th className="px-4 py-3 font-medium text-slate-600 text-right">Perubahan</th>
              <th className="px-4 py-3 font-medium text-slate-600 text-right">Sebelum</th>
              <th className="px-4 py-3 font-medium text-slate-600 text-right">Sesudah</th>
              <th className="px-4 py-3 font-medium text-slate-600">Catatan</th>
            </tr>
          </thead>
          <tbody>
            {data?.data?.map((m) => (
              <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(m.createdAt)}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{m.productName ?? m.productId}</td>
                <td className="px-4 py-3">
                  <StatusBadge>{stockMovementTypeLabels[m.type] ?? m.type}</StatusBadge>
                </td>
                <td className={`px-4 py-3 text-right font-mono font-medium ${m.qtyChange > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {m.qtyChange > 0 ? '+' : ''}{m.qtyChange}
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-500">{m.stockBefore}</td>
                <td className="px-4 py-3 text-right font-mono text-slate-500">{m.stockAfter}</td>
                <td className="px-4 py-3 text-slate-500 text-xs">{m.notes || '-'}</td>
              </tr>
            ))}
            {(!data?.data || data.data.length === 0) && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                  Belum ada pergerakan stok
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} onClose={closeForm} title="Koreksi Stok">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Select label="Produk" options={productOptions} error={errors.productId?.message} {...register('productId')} />
          <Select label="Tipe" options={typeOptions} error={errors.type?.message} {...register('type')} />
          <Input label="Jumlah Perubahan" type="number" error={errors.qtyChange?.message} {...register('qtyChange')} />
          <div>
            <label htmlFor="stock-notes" className="mb-1 block text-sm font-medium text-slate-700">Catatan</label>
            <textarea
              id="stock-notes"
              className="input"
              rows={3}
              {...register('notes')}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={closeForm}>Batal</Button>
            <Button type="submit" disabled={adjustMutation.isPending}>
              {adjustMutation.isPending ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
