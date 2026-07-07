import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError, api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { Button, Input, PageSpinner } from '@/components/ui'
import { formatCurrency } from '@/lib/utils'
import type { Shift } from '@/types'

export function ShiftClosePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [closingCash, setClosingCash] = useState('')
  const [closedShift, setClosedShift] = useState<Shift | null>(null)

  const { data: activeShift, isLoading } = useQuery({
    queryKey: queryKeys.shifts.active,
    queryFn: async () => {
      try {
        return await api.get<Shift>('/shifts/active')
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null
        throw err
      }
    },
    retry: false,
  })

  const mutation = useMutation({
    mutationFn: (data: { closingCash: number }) => api.post<Shift>('/shifts/close', data),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.shifts.active, null)
      queryClient.invalidateQueries({ queryKey: queryKeys.reports.shifts() })
      setClosedShift(result)
    },
  })

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    mutation.mutate({ closingCash: Math.max(0, parseInt(closingCash) || 0) })
  }

  if (isLoading) return <PageSpinner />

  if (closedShift) {
    return (
      <div className="flex h-full items-center justify-center overflow-y-auto bg-slate-100 px-4 py-8">
        <div className="w-full max-w-lg rounded-3xl border border-green-200 bg-white p-6 text-center shadow-xl shadow-slate-200/70 sm:p-8">
          <span className="inline-flex rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
            Transaksi shift selesai
          </span>
          <h1 className="mt-4 text-2xl font-black tracking-tight text-slate-950">Shift Ditutup</h1>
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-500">Kas Sistem</span>
              <span className="font-mono font-bold text-slate-900">{formatCurrency(closedShift.expectedCash ?? 0)}</span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-4 border-t border-slate-200 pt-3">
              <span className="text-slate-500">Kas Akhir</span>
              <span className="font-mono font-bold text-slate-900">{formatCurrency(closedShift.closingCash ?? 0)}</span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-4 border-t border-slate-200 pt-3">
              <span className="text-slate-500">Selisih</span>
              <span className="font-mono font-bold text-primary-700">{formatCurrency(closedShift.difference ?? 0)}</span>
            </div>
          </div>
          <Button type="button" className="mt-6 w-full rounded-2xl" onClick={() => navigate('/cashier')}>
            Kembali ke Kasir
          </Button>
        </div>
      </div>
    )
  }

  if (!activeShift) {
    return (
      <div className="flex h-full items-center justify-center overflow-y-auto bg-slate-100 px-4 py-8">
        <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-xl shadow-slate-200/70 sm:p-8">
          <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
            Shift belum aktif
          </span>
          <h1 className="mt-4 text-2xl font-black tracking-tight text-slate-950">Tidak Ada Shift Aktif</h1>
          <p className="mt-2 text-sm text-slate-500">Buka shift dulu sebelum menutup shift.</p>
          <Button type="button" className="mt-6 w-full rounded-2xl" onClick={() => navigate('/cashier')}>
            Kembali ke Kasir
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto bg-slate-100 px-4 py-8">
      <form onSubmit={handleSubmit} className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 sm:p-8">
        <div className="text-center">
          <span className="inline-flex rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-600">
            Akhiri shift aktif
          </span>
          <h1 className="mt-4 text-2xl font-black tracking-tight text-slate-950">Tutup Shift</h1>
          <p className="mt-2 text-sm text-slate-500">Masukkan kas akhir hasil hitung manual.</p>
        </div>

        {activeShift && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-500">Modal Awal</span>
              <span className="font-mono font-bold text-slate-900">{formatCurrency(activeShift.openingCash)}</span>
            </div>
            {'expectedCash' in activeShift && typeof activeShift.expectedCash === 'number' && (
              <div className="mt-3 flex items-center justify-between gap-4 border-t border-slate-200 pt-3">
                <span className="text-slate-500">Kas Sistem</span>
                <span className="font-mono font-bold text-primary-700">{formatCurrency(activeShift.expectedCash)}</span>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-primary-100 bg-primary-50/50 p-4">
          <Input
            label="Kas Akhir"
            type="number"
            min={0}
            value={closingCash}
            onChange={(e) => setClosingCash(e.target.value)}
            placeholder="0"
            className="h-14 rounded-2xl border-primary-200 bg-white text-lg font-bold shadow-inner focus:border-primary-500"
            autoFocus
          />
          <p className="mt-2 text-xs text-slate-500">Isi nominal tunai yang ada di laci kas.</p>
        </div>

        {mutation.isError && (
          <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
            {mutation.error instanceof Error ? mutation.error.message : 'Gagal menutup shift'}
          </div>
        )}

        <div className="mt-6 space-y-3">
          <Button type="submit" className="h-[52px] w-full rounded-2xl text-base font-bold" variant="danger" loading={mutation.isPending}>
            Tutup Shift
          </Button>
          <Button type="button" className="w-full rounded-2xl" variant="secondary" onClick={() => navigate('/cashier')}>
            Kembali ke Kasir
          </Button>
        </div>
      </form>
    </div>
  )
}
