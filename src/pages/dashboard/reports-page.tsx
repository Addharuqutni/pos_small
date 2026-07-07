import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { formatCurrency, formatDateOnly, localDateInputValue, localDayIso } from '@/lib/utils'
import { Button, Input, PageSpinner } from '@/components/ui'
import { Download } from 'lucide-react'

interface SalesReportRow {
  date: string
  totalSales: number
  totalRevenue: number
  totalDiscount: number
  totalTax: number
}

interface SalesReportSummary {
  totalSales: number
  totalRevenue: number
  totalDiscount: number
  totalTax: number
}

interface SalesReportResponse {
  daily: SalesReportRow[]
  summary: SalesReportSummary
}

export function ReportsPage() {
  const today = localDateInputValue()
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const startQuery = localDayIso(startDate)
  const endQuery = localDayIso(endDate, true)

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.reports.sales({ startDate, endDate }),
    queryFn: () =>
      api.get<SalesReportResponse>(`/reports/sales?start=${startQuery}&end=${endQuery}`),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  })

  const handleExport = () => {
    // PRD §9.9 — CSV export
    window.open(`/api/reports/sales?start=${startQuery}&end=${endQuery}&format=csv`, '_blank')
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Laporan Penjualan</h1>
          <p className="text-sm text-slate-500">Rangkuman penjualan per periode</p>
        </div>
        <Button variant="secondary" onClick={handleExport}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex gap-4">
        <Input
          label="Dari"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="max-w-[180px]"
        />
        <Input
          label="Sampai"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="max-w-[180px]"
        />
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : (
        <>
          {data?.summary && (
            <div className="mb-4 grid gap-4 sm:grid-cols-4">
              <div className="card p-4">
                <p className="text-xs text-slate-500">Transaksi</p>
                <p className="mt-1 text-xl font-bold text-slate-900">{data.summary.totalSales}</p>
              </div>
              <div className="card p-4">
                <p className="text-xs text-slate-500">Omzet</p>
                <p className="mt-1 text-xl font-bold text-slate-900">{formatCurrency(data.summary.totalRevenue)}</p>
              </div>
              <div className="card p-4">
                <p className="text-xs text-slate-500">Diskon</p>
                <p className="mt-1 text-xl font-bold text-slate-900">{formatCurrency(data.summary.totalDiscount)}</p>
              </div>
              <div className="card p-4">
                <p className="text-xs text-slate-500">Pajak</p>
                <p className="mt-1 text-xl font-bold text-slate-900">{formatCurrency(data.summary.totalTax)}</p>
              </div>
            </div>
          )}

          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left">
                  <th className="px-4 py-3 font-medium text-slate-600">Tanggal</th>
                  <th className="px-4 py-3 font-medium text-slate-600 text-right">Transaksi</th>
                  <th className="px-4 py-3 font-medium text-slate-600 text-right">Diskon</th>
                  <th className="px-4 py-3 font-medium text-slate-600 text-right">Pajak</th>
                  <th className="px-4 py-3 font-medium text-slate-600 text-right">Omzet</th>
                </tr>
              </thead>
              <tbody>
                {data?.daily.map((row) => (
                  <tr key={row.date} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-700">{formatDateOnly(row.date)}</td>
                    <td className="px-4 py-3 text-right font-mono">{row.totalSales}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatCurrency(row.totalDiscount)}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatCurrency(row.totalTax)}</td>
                    <td className="px-4 py-3 text-right font-mono font-medium">{formatCurrency(row.totalRevenue)}</td>
                  </tr>
                ))}
                {(!data?.daily || data.daily.length === 0) && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                      Tidak ada data untuk periode ini
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
