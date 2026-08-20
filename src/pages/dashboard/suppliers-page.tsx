import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { Button, Input, Modal, PageHeader, TableSkeleton, StatusBadge, ErrorState } from '@/components/ui'
import { Plus, Edit2, Power, Truck } from 'lucide-react'
import type { Supplier } from '@/types'

const supplierSchema = z.object({
  name: z.string().min(1, 'Nama wajib diisi').max(255),
  phone: z.string().optional(),
  address: z.string().optional(),
})

type SupplierForm = z.infer<typeof supplierSchema>

export function SuppliersPage() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)

  const { data: suppliers, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.suppliers.list(),
    queryFn: () => api.get<Supplier[]>('/suppliers'),
  })

  const saveMutation = useMutation({
    mutationFn: (data: SupplierForm & { id?: string }) => {
      const body = {
        name: data.name,
        phone: data.phone || null,
        address: data.address || null,
      }
      return data.id ? api.patch(`/suppliers/${data.id}`, body) : api.post('/suppliers', body)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.all })
      closeForm()
    },
  })

  const toggleMutation = useMutation({
    mutationFn: (supplier: Supplier) => api.patch(`/suppliers/${supplier.id}`, { isActive: !supplier.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.all }),
  })

  const { register, handleSubmit, reset, formState: { errors } } = useForm<SupplierForm>({
    resolver: zodResolver(supplierSchema),
  })

  const openCreate = () => {
    setEditing(null)
    reset({ name: '', phone: '', address: '' })
    setShowForm(true)
  }

  const openEdit = (supplier: Supplier) => {
    setEditing(supplier)
    reset({ name: supplier.name, phone: supplier.phone ?? '', address: supplier.address ?? '' })
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditing(null)
  }

  const onSubmit = (data: SupplierForm) => saveMutation.mutate({ ...data, id: editing?.id })

  if (isLoading) return <TableSkeleton rows={5} />
  if (isError) return <ErrorState message="Gagal memuat supplier." onRetry={() => refetch()} />

  return (
    <div>
      <PageHeader title="Supplier" subtitle="Kelola pemasok barang">
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Tambah Supplier
        </Button>
      </PageHeader>

      <div className="table-shell">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left">
              <th className="px-4 py-3 font-medium text-slate-600">Nama</th>
              <th className="px-4 py-3 font-medium text-slate-600">Telepon</th>
              <th className="px-4 py-3 font-medium text-slate-600">Alamat</th>
              <th className="px-4 py-3 font-medium text-slate-600">Status</th>
              <th className="px-4 py-3 font-medium text-slate-600">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {suppliers?.map((supplier) => (
              <tr key={supplier.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{supplier.name}</td>
                <td className="px-4 py-3 text-slate-500">{supplier.phone || '-'}</td>
                <td className="px-4 py-3 text-slate-500">{supplier.address || '-'}</td>
                <td className="px-4 py-3">
                  <StatusBadge tone={supplier.isActive ? 'green' : 'slate'}>
                    {supplier.isActive ? 'Aktif' : 'Nonaktif'}
                  </StatusBadge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(supplier)} className="icon-button" aria-label={`Ubah ${supplier.name}`}>
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button onClick={() => toggleMutation.mutate(supplier)} className="icon-button" aria-label={`${supplier.isActive ? 'Nonaktifkan' : 'Aktifkan'} ${supplier.name}`}>
                      <Power className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {(!suppliers || suppliers.length === 0) && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                  <Truck className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                  Belum ada supplier
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} onClose={closeForm} title={editing ? 'Ubah Supplier' : 'Tambah Supplier'} className="max-w-lg">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input label="Nama Supplier" error={errors.name?.message} {...register('name')} />
          <Input label="Telepon" error={errors.phone?.message} {...register('phone')} />
          <div>
            <label htmlFor="supplier-address" className="mb-1 block text-sm font-medium text-slate-700">Alamat</label>
            <textarea id="supplier-address" className="input" rows={3} {...register('address')} />
          </div>

          {saveMutation.isError && (
            <p className="text-sm text-red-600" role="alert">
              {saveMutation.error instanceof Error ? saveMutation.error.message : 'Gagal menyimpan supplier'}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={closeForm}>Batal</Button>
            <Button type="submit" loading={saveMutation.isPending}>{editing ? 'Simpan' : 'Tambah'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
