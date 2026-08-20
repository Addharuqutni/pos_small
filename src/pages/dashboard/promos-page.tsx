import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Button, Input, Select, Modal, PageHeader, TableSkeleton, StatusBadge, ErrorState } from '@/components/ui'
import { Plus, Edit2, Power, TicketPercent } from 'lucide-react'
import type { Promo } from '@/types'

const promoSchema = z.object({
  code: z.string().min(1, 'Kode wajib diisi').max(50),
  name: z.string().min(1, 'Nama wajib diisi').max(255),
  type: z.enum(['percent', 'amount']),
  value: z.coerce.number().min(0, 'Nilai tidak boleh negatif'),
  minPurchase: z.coerce.number().min(0),
  maxDiscount: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  usageLimit: z.string(),
})

type PromoForm = z.infer<typeof promoSchema>

const typeOptions = [
  { value: 'percent', label: 'Persen (%)' },
  { value: 'amount', label: 'Nominal (Rp)' },
]

function toLocalDatetime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function PromosPage() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Promo | null>(null)

  const { data: promos, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.promos.list(),
    queryFn: () => api.get<Promo[]>('/promos'),
  })

  const saveMutation = useMutation({
    mutationFn: (data: PromoForm & { id?: string }) => {
      const body = {
        code: data.code,
        name: data.name,
        type: data.type,
        value: data.value,
        minPurchase: data.minPurchase,
        maxDiscount: data.maxDiscount === '' ? null : Number(data.maxDiscount),
        startsAt: data.startsAt ? new Date(data.startsAt).toISOString() : new Date().toISOString(),
        endsAt: data.endsAt ? new Date(data.endsAt).toISOString() : null,
        usageLimit: data.usageLimit === '' ? null : Number(data.usageLimit),
      }
      return data.id
        ? api.patch(`/promos/${data.id}`, body)
        : api.post('/promos', body)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.promos.all })
      closeForm()
    },
  })

  const toggleMutation = useMutation({
    mutationFn: (promo: Promo) => api.patch(`/promos/${promo.id}`, { isActive: !promo.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.promos.all }),
  })

  const { register, handleSubmit, reset, formState: { errors } } = useForm<PromoForm>({
    resolver: zodResolver(promoSchema),
    defaultValues: {
      type: 'percent',
      value: 0,
      minPurchase: 0,
      maxDiscount: '',
      startsAt: '',
      endsAt: '',
      usageLimit: '',
    },
  })

  const openCreate = () => {
    setEditing(null)
    reset({ code: '', name: '', type: 'percent', value: 0, minPurchase: 0, maxDiscount: '', startsAt: '', endsAt: '', usageLimit: '' })
    setShowForm(true)
  }

  const openEdit = (promo: Promo) => {
    setEditing(promo)
    reset({
      code: promo.code,
      name: promo.name,
      type: promo.type,
      value: promo.value,
      minPurchase: promo.minPurchase,
      maxDiscount: promo.maxDiscount?.toString() ?? '',
      startsAt: toLocalDatetime(promo.startsAt),
      endsAt: toLocalDatetime(promo.endsAt),
      usageLimit: promo.usageLimit?.toString() ?? '',
    })
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditing(null)
  }

  const onSubmit = (data: PromoForm) => saveMutation.mutate({ ...data, id: editing?.id })

  const describeValue = (promo: Promo) =>
    promo.type === 'percent' ? `${promo.value}%` : formatCurrency(promo.value)

  if (isLoading) return <TableSkeleton rows={5} />
  if (isError) return <ErrorState message="Gagal memuat promo." onRetry={() => refetch()} />

  return (
    <div>
      <PageHeader title="Promo & Diskon" subtitle="Kelola voucher dan kode promo">
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Tambah Promo
        </Button>
      </PageHeader>

      <div className="table-shell">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left">
              <th className="px-4 py-3 font-medium text-slate-600">Kode</th>
              <th className="px-4 py-3 font-medium text-slate-600">Nama</th>
              <th className="px-4 py-3 font-medium text-slate-600">Nilai</th>
              <th className="px-4 py-3 font-medium text-slate-600 text-right">Min. Belanja</th>
              <th className="px-4 py-3 font-medium text-slate-600 text-right">Pemakaian</th>
              <th className="px-4 py-3 font-medium text-slate-600">Berlaku</th>
              <th className="px-4 py-3 font-medium text-slate-600">Status</th>
              <th className="px-4 py-3 font-medium text-slate-600">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {promos?.map((promo) => (
              <tr key={promo.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-mono font-semibold text-primary-700">{promo.code}</td>
                <td className="px-4 py-3 text-slate-900">{promo.name}</td>
                <td className="px-4 py-3 font-mono">{describeValue(promo)}</td>
                <td className="px-4 py-3 text-right font-mono">{formatCurrency(promo.minPurchase)}</td>
                <td className="px-4 py-3 text-right font-mono">
                  {promo.usageCount}{promo.usageLimit != null ? ` / ${promo.usageLimit}` : ''}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {formatDate(promo.startsAt)}<br />{promo.endsAt ? `s.d. ${formatDate(promo.endsAt)}` : 'tanpa batas'}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge tone={promo.isActive ? 'green' : 'slate'}>
                    {promo.isActive ? 'Aktif' : 'Nonaktif'}
                  </StatusBadge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(promo)} className="icon-button" aria-label={`Ubah ${promo.code}`}>
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button onClick={() => toggleMutation.mutate(promo)} className="icon-button" aria-label={`${promo.isActive ? 'Nonaktifkan' : 'Aktifkan'} ${promo.code}`}>
                      <Power className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {(!promos || promos.length === 0) && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                  <TicketPercent className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                  Belum ada promo
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} onClose={closeForm} title={editing ? 'Ubah Promo' : 'Tambah Promo'} className="max-w-lg">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Kode Promo" error={errors.code?.message} {...register('code')} />
            <Input label="Nama Promo" error={errors.name?.message} {...register('name')} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Tipe" options={typeOptions} error={errors.type?.message} {...register('type')} />
            <Input label="Nilai" type="number" error={errors.value?.message} {...register('value')} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Minimal Belanja (Rp)" type="number" error={errors.minPurchase?.message} {...register('minPurchase')} />
            <Input label="Maksimal Diskon (Rp, kosong = tanpa batas)" type="number" error={errors.maxDiscount?.message} {...register('maxDiscount')} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Mulai Berlaku" type="datetime-local" error={errors.startsAt?.message} {...register('startsAt')} />
            <Input label="Berakhir (kosong = tanpa batas)" type="datetime-local" error={errors.endsAt?.message} {...register('endsAt')} />
          </div>
          <Input label="Batas Pemakaian (kosong = tanpa batas)" type="number" error={errors.usageLimit?.message} {...register('usageLimit')} />

          {saveMutation.isError && (
            <p className="text-sm text-red-600" role="alert">
              {saveMutation.error instanceof Error ? saveMutation.error.message : 'Gagal menyimpan promo'}
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
