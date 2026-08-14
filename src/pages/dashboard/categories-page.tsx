import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { Button, Input, Modal, PageHeader, TableSkeleton, StatusBadge, ErrorState } from '@/components/ui'
import { Plus, Edit2, Power } from 'lucide-react'
import type { Category } from '@/types'

const categorySchema = z.object({
  name: z.string().min(1, 'Nama kategori wajib diisi'),
})

type CategoryForm = z.infer<typeof categorySchema>

export function CategoriesPage() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)

  const { data: categories, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.categories.list(),
    queryFn: () => api.get<Category[]>('/categories'),
  })

  const saveMutation = useMutation({
    mutationFn: (data: CategoryForm & { id?: string }) =>
      data.id
        ? api.patch(`/categories/${data.id}`, data)
        : api.post('/categories', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.categories.all })
      closeForm()
    },
  })

  const toggleMutation = useMutation({
    mutationFn: (cat: Category) =>
      api.patch(`/categories/${cat.id}`, { isActive: !cat.isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.categories.all })
    },
  })

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CategoryForm>({
    resolver: zodResolver(categorySchema),
  })

  const openCreate = () => {
    setEditing(null)
    reset({ name: '' })
    setShowForm(true)
  }

  const openEdit = (cat: Category) => {
    setEditing(cat)
    reset({ name: cat.name })
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditing(null)
  }

  const onSubmit = (data: CategoryForm) => {
    saveMutation.mutate({ ...data, id: editing?.id })
  }

  if (isLoading) return <TableSkeleton rows={5} cols={[30, 14, 12]} />
  if (isError) return <ErrorState message="Gagal memuat kategori." onRetry={() => refetch()} />

  return (
    <div>
      <PageHeader title="Kategori" subtitle="Kelola kategori produk">
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Tambah Kategori
        </Button>
      </PageHeader>

      {toggleMutation.isError && (
        <p className="mb-4 text-sm text-red-600" role="alert">
          {toggleMutation.error instanceof Error ? toggleMutation.error.message : 'Gagal mengubah status kategori'}
        </p>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left">
              <th className="px-4 py-3 font-medium text-slate-600">Nama</th>
              <th className="px-4 py-3 font-medium text-slate-600">Status</th>
              <th className="px-4 py-3 font-medium text-slate-600">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {categories?.map((cat) => (
              <tr key={cat.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{cat.name}</td>
                <td className="px-4 py-3">
                  <StatusBadge tone={cat.isActive ? 'green' : 'slate'}>
                    {cat.isActive ? 'Aktif' : 'Nonaktif'}
                  </StatusBadge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button
                      onClick={() => openEdit(cat)}
                      className="icon-button"
                      aria-label={`Edit ${cat.name}`}
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => toggleMutation.mutate(cat)}
                      className="icon-button"
                      aria-label={`${cat.isActive ? 'Nonaktifkan' : 'Aktifkan'} ${cat.name}`}
                    >
                      <Power className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {(!categories || categories.length === 0) && (
              <tr>
                <td colSpan={3} className="px-4 py-12 text-center text-slate-500">
                  Belum ada kategori
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} onClose={closeForm} title={editing ? 'Edit Kategori' : 'Tambah Kategori'}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input label="Nama Kategori" error={errors.name?.message} autoFocus {...register('name')} />
          {saveMutation.isError && (
            <p className="text-sm text-red-600" role="alert">
              {saveMutation.error instanceof Error ? saveMutation.error.message : 'Gagal menyimpan kategori'}
            </p>
          )}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={closeForm}>Batal</Button>
            <Button type="submit" loading={saveMutation.isPending}>
              {editing ? 'Simpan' : 'Tambah'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
