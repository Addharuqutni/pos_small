import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { useAuth } from '@/contexts/auth-context'
import { Button, Input, PageSpinner } from '@/components/ui'
import type { StoreSettings } from '@/types'

const settingsSchema = z.object({
  storeName: z.string().min(1, 'Nama toko wajib diisi'),
  storeAddress: z.string(),
  storePhone: z.string(),
  receiptFooter: z.string(),
  taxEnabled: z.boolean(),
  taxRate: z.coerce.number().min(0).max(100),
  currency: z.string(),
  allowNegativeStockDefault: z.boolean(),
})

type SettingsForm = z.infer<typeof settingsSchema>

export function SettingsPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const { data: settings, isLoading } = useQuery({
    queryKey: queryKeys.settings.all,
    queryFn: () => api.get<StoreSettings>('/settings'),
  })

  const mutation = useMutation({
    mutationFn: (data: SettingsForm) => api.patch('/settings', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.settings.all }),
  })

  const { register, handleSubmit, formState: { errors } } = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    values: settings,
  })

  // PRD §9.11 — only owner
  if (user?.role !== 'owner') {
    return <div className="flex h-64 items-center justify-center text-slate-400">Hanya owner yang bisa mengubah pengaturan</div>
  }

  if (isLoading) return <PageSpinner />

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Pengaturan Toko</h1>
        <p className="text-sm text-slate-500">Konfigurasi informasi toko</p>
      </div>

      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="card space-y-4">
        <Input label="Nama Toko" error={errors.storeName?.message} {...register('storeName')} />
        <Input label="Alamat" {...register('storeAddress')} />
        <Input label="Telepon" {...register('storePhone')} />
        <Input label="Footer Struk" {...register('receiptFooter')} />
        <Input label="Mata Uang" {...register('currency')} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300" {...register('taxEnabled')} />
              Pajak Aktif
            </label>
          </div>
          <Input label="Tarif Pajak (%)" type="number" step="0.01" error={errors.taxRate?.message} {...register('taxRate')} />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 rounded border-slate-300" {...register('allowNegativeStockDefault')} />
          Izinkan stok negatif (default produk baru)
        </label>

        <div className="flex justify-end pt-2">
          <Button type="submit" loading={mutation.isPending}>Simpan Pengaturan</Button>
        </div>

        {mutation.isSuccess && (
          <p className="text-sm text-green-600">Pengaturan berhasil disimpan</p>
        )}
        {mutation.isError && (
          <p className="text-sm text-red-600" role="alert">
            {mutation.error instanceof Error ? mutation.error.message : 'Gagal menyimpan pengaturan'}
          </p>
        )}
      </form>
    </div>
  )
}
