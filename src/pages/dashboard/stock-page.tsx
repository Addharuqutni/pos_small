import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { formatDate } from '@/lib/utils'
import { Button, Input, Select, Modal, PageSpinner } from '@/components/ui'
import { Plus } from 'lucide-react'
import type { StockMovement, Product, PaginatedResponse } from '@/types'

const typeLabels: Record<string, string> = {
  sale: 'Penjualan',
  adjustment: 'Koreksi',
  return: 'Retur',
  restock: 'Restock',
  refund: 'Refund',
}

const adjustSchema = z.object({
  productId: z.string().min(1, 'Pilih produk'),
  type: z.enum(['adjustment', 'restock'], { required_error: 'Pilih tipe' }),
  qtyChange: z.coerce.number().int().refine((v) => v !== 0, 'Jumlah tidak boleh 0'),
  notes: z.string().optional(),
})

type AdjustForm = z.infer<typeof adjustSchema>

const typeOptions = [
  { value: 'adjustment', label: 'Koreksi' },
  { value: 'restock', label: 'Restock' },
]

export function StockPage() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.stock.movements({}),
    queryFn: () => api.get<PaginatedResponse<StockMovement>>('/stock/movements'),
  })

  const { data: productsData } = useQuery({
    queryKey: queryKeys.products.list({ active: true }),
    queryFn: () => api.get<PaginatedResponse<Product>>('/products?active=true'),
    enabled: showForm,
  })

  const adjustMutation = useMutation({
    mutationFn: (body: AdjustForm) => api.post('/stock/adjust', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.stock.movements({}) })
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.reports.lowStock() })
      closeForm()
    },
  })

  const { register, handleSubmit, reset, formState: { errors } } = useForm<AdjustForm>({
    resolver: zodResolver(adjustSchema),
  })

  const openForm = () => {
    reset({ productId: '', type: 'adjustment', qtyChange: 0, notes: '' })
    setShowForm(true)
  }

  const closeForm = () => setShowForm(false)

  const onSubmit = (data: AdjustForm) => adjustMutation.mutate(data)

  const productOptions = (productsData?.data ?? []).map((p) => ({
    value: p.id,
    label: p.name,
  }))

  if (isLoading) return <PageSpinner />

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Stok</h1>
          <p className="text-sm text-slate-500">Riwayat pergerakan stok</p>
        </div>
        <Button onClick={openForm}>
          <Plus className="mr-1 h-4 w-4" />
          Koreksi Stok
        </Button>
      </div>

      <div className="card overflow-x-auto p-0">
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
                  <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {typeLabels[m.type] ?? m.type}
                  </span>
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
                <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
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
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              rows={3}
              {...register('notes')}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={closeForm}>Batal</Button>
            <Button type="submit" disabled={adjustMutation.isPending}>
              {adjustMutation.isPending ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
