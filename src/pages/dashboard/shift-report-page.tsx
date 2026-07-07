import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { formatCurrency, formatDate } from '@/lib/utils'
import { PageSpinner } from '@/components/ui'
import type { Shift } from '@/types'

type ShiftReport = Shift & { cashierName: string }

export function ShiftReportPage() {
  const { data: shifts, isLoading } = useQuery({
    queryKey: queryKeys.reports.shifts(),
    queryFn: () => api.get<ShiftReport[]>('/shifts/report'),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  })

  if (isLoading) return <PageSpinner />

  const visibleShifts = shifts?.filter((s) => {
    if (s.status !== 'open') return true
    const openedAt = new Date(s.openedAt).getTime()
    const hasNewerShift = shifts.some(
      (other) => other.cashierId === s.cashierId && new Date(other.openedAt).getTime() > openedAt,
    )
    return !hasNewerShift
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Laporan Shift</h1>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Kasir</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Dibuka</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Ditutup</th>
              <th className="px-4 py-3 text-right font-medium text-slate-600">Kas Awal</th>
              <th className="px-4 py-3 text-right font-medium text-slate-600">Kas Akhir</th>
              <th className="px-4 py-3 text-right font-medium text-slate-600">Kas Diharapkan</th>
              <th className="px-4 py-3 text-right font-medium text-slate-600">Selisih</th>
              <th className="px-4 py-3 text-center font-medium text-slate-600">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibleShifts?.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                  Belum ada data shift.
                </td>
              </tr>
            )}
            {visibleShifts?.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-900">{s.cashierName}</td>
                <td className="px-4 py-3 text-slate-600">{formatDate(s.openedAt)}</td>
                <td className="px-4 py-3 text-slate-600">{s.closedAt ? formatDate(s.closedAt) : '-'}</td>
                <td className="px-4 py-3 text-right text-slate-900">{formatCurrency(s.openingCash)}</td>
                <td className="px-4 py-3 text-right text-slate-900">{s.closingCash != null ? formatCurrency(s.closingCash) : '-'}</td>
                <td className="px-4 py-3 text-right text-slate-900">{s.expectedCash != null ? formatCurrency(s.expectedCash) : '-'}</td>
                <td className="px-4 py-3 text-right text-slate-900">{s.difference != null ? formatCurrency(s.difference) : '-'}</td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={
                      s.status === 'open'
                        ? 'inline-block rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700'
                        : 'inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700'
                    }
                  >
                    {s.status === 'open' ? 'Buka' : 'Tutup'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
