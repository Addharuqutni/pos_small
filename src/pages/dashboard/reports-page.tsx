import { useState } from 'react'
import { useSalesReport, salesReportExportUrl } from '@/queries/reports'
import { formatCurrency, formatDateOnly, localDateInputValue, localDayIso } from '@/lib/utils'
import { Button, Input, PageHeader, TableSkeleton, ErrorState } from '@/components/ui'
import { Download, FileText } from 'lucide-react'

export function ReportsPage() {
  const today = new Date()
  const monthAgo = new Date(today)
  monthAgo.setMonth(monthAgo.getMonth() - 1)
  const [startDate, setStartDate] = useState(localDateInputValue(monthAgo))
  const [endDate, setEndDate] = useState(localDateInputValue(today))
  const invalidRange = !startDate || !endDate || startDate > endDate
  const startQuery = startDate ? localDayIso(startDate) : ''
  const endQuery = endDate ? localDayIso(endDate, true) : ''

  const { data, isLoading, isError, refetch } = useSalesReport(
    { startDate, endDate, startQuery, endQuery },
    { enabled: !invalidRange },
  )

  const handleExport = () => {
    // PRD §9.9 — CSV export
    window.open(salesReportExportUrl({ startQuery, endQuery }, 'csv'), '_blank')
  }

  const handleExportPdf = () => {
    // Printable HTML report — user saves as PDF via browser print dialog.
    window.open(salesReportExportUrl({ startQuery, endQuery }, 'html'), '_blank')
  }

  return (
    <div>
      <PageHeader title="Laporan Penjualan" subtitle="Rangkuman penjualan per periode">
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleExport} disabled={invalidRange}>
            <Download className="h-4 w-4" /> Ekspor CSV
          </Button>
          <Button variant="secondary" onClick={handleExportPdf} disabled={invalidRange}>
            <FileText className="h-4 w-4" /> Ekspor PDF
          </Button>
        </div>
      </PageHeader>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-4">
        <Input
          label="Dari"
          type="date"
          required
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          max={endDate || undefined}
          className="max-w-[180px]"
        />
        <Input
          label="Sampai"
          type="date"
          required
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          min={startDate || undefined}
          className="max-w-[180px]"
        />
        {invalidRange && (
          <p className="self-end pb-2 text-sm font-bold text-red-600" role="alert">
            {!startDate || !endDate ? 'Pilih tanggal awal dan akhir.' : 'Tanggal awal tidak boleh setelah tanggal akhir.'}
          </p>
        )}
      </div>

      {invalidRange ? null : isLoading ? (
        <TableSkeleton rows={7} />
      ) : isError ? (
        <ErrorState message="Gagal memuat laporan." onRetry={() => refetch()} />
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

          <div className="table-shell">
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
                    <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
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
