import { useState } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { useCategories } from '@/queries/categories'
import { useProducts } from '@/queries/products'
import { useUsers } from '@/queries/users'
import {
  cashiersReportExportUrl,
  profitReportExportUrl,
  salesReportExportUrl,
  useCashiersReport,
  useProfitReport,
  useSalesReport,
  type ReportFilters,
  type ReportRange,
} from '@/queries/reports'
import { cn, formatCurrency, formatDateOnly, formatPercent, localDateInputValue, localDayIso } from '@/lib/utils'
import { Button, Input, Select, PageHeader, TableSkeleton, ErrorState } from '@/components/ui'
import { Download, FileText } from 'lucide-react'
import { paymentMethodLabels, saleStatusLabels } from '@/types'
import type { PaymentMethod, ProfitGroupBy, SaleStatus } from '@/types'

type ReportTab = 'sales' | 'cashiers' | 'profit'

const paymentMethodOptions = (Object.keys(paymentMethodLabels) as PaymentMethod[]).map((value) => ({
  value,
  label: paymentMethodLabels[value],
}))

const statusOptions = (Object.keys(saleStatusLabels) as SaleStatus[]).map((value) => ({
  value,
  label: saleStatusLabels[value],
}))

const profitGroupOptions: { value: ProfitGroupBy; label: string }[] = [
  { value: 'product', label: 'Produk' },
  { value: 'category', label: 'Kategori' },
  { value: 'day', label: 'Harian' },
]

const profitGroupLabel: Record<ProfitGroupBy, string> = {
  product: 'Produk',
  category: 'Kategori',
  day: 'Tanggal',
}

/**
 * Filter selects are stored as plain strings so one generic setter can drive
 * them; the report filters are narrowed back to their enums before use.
 */
interface FilterForm {
  cashierId: string
  paymentMethod: string
  status: string
  categoryId: string
  productId: string
}

const emptyFilterForm: FilterForm = {
  cashierId: '',
  paymentMethod: '',
  status: '',
  categoryId: '',
  productId: '',
}

const isPaymentMethod = (value: string): value is PaymentMethod => value in paymentMethodLabels
const isSaleStatus = (value: string): value is SaleStatus => value in saleStatusLabels

interface TabProps {
  range: ReportRange
  filters: ReportFilters
}

/** PRD §8.2 — daily sales summary for the range */
function SalesTab({ range, filters }: TabProps) {
  const { data, isLoading, isError, refetch } = useSalesReport(range, filters)

  if (isLoading) return <TableSkeleton rows={7} />
  if (isError) return <ErrorState message="Gagal memuat laporan." onRetry={() => refetch()} />

  return (
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
  )
}

/** GET /reports/cashiers — sales, voids and refunds per cashier */
function CashiersTab({ range, filters }: TabProps) {
  const { data, isLoading, isError, refetch } = useCashiersReport(range, filters)

  if (isLoading) return <TableSkeleton rows={6} />
  if (isError) return <ErrorState message="Gagal memuat laporan kasir." onRetry={() => refetch()} />

  const rows = data?.rows ?? []
  const totals = rows.reduce(
    (acc, row) => ({
      saleCount: acc.saleCount + row.saleCount,
      grossSales: acc.grossSales + row.grossSales,
      discountTotal: acc.discountTotal + row.discountTotal,
      voidCount: acc.voidCount + row.voidCount,
      voidTotal: acc.voidTotal + row.voidTotal,
      refundTotal: acc.refundTotal + row.refundTotal,
      netSales: acc.netSales + row.netSales,
    }),
    { saleCount: 0, grossSales: 0, discountTotal: 0, voidCount: 0, voidTotal: 0, refundTotal: 0, netSales: 0 },
  )

  return (
    <div className="table-shell">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left">
            <th className="px-4 py-3 font-medium text-slate-600">Kasir</th>
            <th className="px-4 py-3 font-medium text-slate-600 text-right">Transaksi</th>
            <th className="px-4 py-3 font-medium text-slate-600 text-right">Omzet Kotor</th>
            <th className="px-4 py-3 font-medium text-slate-600 text-right">Diskon</th>
            <th className="px-4 py-3 font-medium text-slate-600 text-right">Void</th>
            <th className="px-4 py-3 font-medium text-slate-600 text-right">Nilai Void</th>
            <th className="px-4 py-3 font-medium text-slate-600 text-right">Pengembalian</th>
            <th className="px-4 py-3 font-medium text-slate-600 text-right">Penjualan Bersih</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.cashierId} className="border-b border-slate-100 hover:bg-slate-50">
              <td className="px-4 py-3 text-slate-900">{row.cashierName}</td>
              <td className="px-4 py-3 text-right font-mono">{row.saleCount}</td>
              <td className="px-4 py-3 text-right font-mono">{formatCurrency(row.grossSales)}</td>
              <td className="px-4 py-3 text-right font-mono">{formatCurrency(row.discountTotal)}</td>
              <td className="px-4 py-3 text-right font-mono">{row.voidCount}</td>
              <td className="px-4 py-3 text-right font-mono">{formatCurrency(row.voidTotal)}</td>
              <td className="px-4 py-3 text-right font-mono">{formatCurrency(row.refundTotal)}</td>
              <td className="px-4 py-3 text-right font-mono font-medium">{formatCurrency(row.netSales)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                Tidak ada data untuk periode ini
              </td>
            </tr>
          )}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50 text-slate-900">
              <td className="px-4 py-3 font-bold">Total</td>
              <td className="px-4 py-3 text-right font-mono font-bold">{totals.saleCount}</td>
              <td className="px-4 py-3 text-right font-mono font-bold">{formatCurrency(totals.grossSales)}</td>
              <td className="px-4 py-3 text-right font-mono font-bold">{formatCurrency(totals.discountTotal)}</td>
              <td className="px-4 py-3 text-right font-mono font-bold">{totals.voidCount}</td>
              <td className="px-4 py-3 text-right font-mono font-bold">{formatCurrency(totals.voidTotal)}</td>
              <td className="px-4 py-3 text-right font-mono font-bold">{formatCurrency(totals.refundTotal)}</td>
              <td className="px-4 py-3 text-right font-mono font-bold">{formatCurrency(totals.netSales)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

interface ProfitTabProps extends TabProps {
  groupBy: ProfitGroupBy
  onGroupByChange: (groupBy: ProfitGroupBy) => void
}

/** GET /reports/profit — owner only (admins receive a 403) */
function ProfitTab({ range, filters, groupBy, onGroupByChange }: ProfitTabProps) {
  const { data, isLoading, isError, refetch } = useProfitReport(range, groupBy, filters)

  if (isLoading) return <TableSkeleton rows={7} />
  if (isError) return <ErrorState message="Gagal memuat laporan laba." onRetry={() => refetch()} />

  const rows = data?.rows ?? []
  const summary = data?.summary
  const hasEstimatedCost = summary?.hasEstimatedCost || rows.some((row) => row.hasEstimatedCost)

  return (
    <>
      {summary && (
        <div className="mb-4 grid gap-4 sm:grid-cols-4">
          <div className="card p-4">
            <p className="text-xs text-slate-500">Omzet</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{formatCurrency(summary.revenue)}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-slate-500">HPP</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{formatCurrency(summary.cogs)}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-slate-500">Laba Kotor</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{formatCurrency(summary.grossProfit)}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-slate-500">Margin</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{formatPercent(summary.marginPct)}</p>
          </div>
        </div>
      )}

      <div className="mb-3 flex items-center gap-2" role="group" aria-label="Kelompokkan laba">
        <span className="text-sm text-slate-500">Kelompokkan:</span>
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
          {profitGroupOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={groupBy === option.value}
              onClick={() => onGroupByChange(option.value)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-bold transition-colors',
                groupBy === option.value ? 'bg-primary-600 text-white' : 'text-slate-600 hover:bg-slate-100',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="table-shell">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left">
              <th className="px-4 py-3 font-medium text-slate-600">{profitGroupLabel[groupBy]}</th>
              <th className="px-4 py-3 font-medium text-slate-600 text-right">Qty</th>
              <th className="px-4 py-3 font-medium text-slate-600 text-right">Omzet</th>
              <th className="px-4 py-3 font-medium text-slate-600 text-right">HPP</th>
              <th className="px-4 py-3 font-medium text-slate-600 text-right">Laba Kotor</th>
              <th className="px-4 py-3 font-medium text-slate-600 text-right">Margin</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-900">
                  {groupBy === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(row.label) ? formatDateOnly(row.label) : row.label}
                </td>
                <td className="px-4 py-3 text-right font-mono">{row.qty}</td>
                <td className="px-4 py-3 text-right font-mono">{formatCurrency(row.revenue)}</td>
                <td className="px-4 py-3 text-right font-mono">
                  {formatCurrency(row.cogs)}
                  {row.hasEstimatedCost && (
                    <span className="ml-1 text-amber-600" title="Sebagian HPP memakai harga modal saat ini">
                      *
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-mono font-medium">{formatCurrency(row.grossProfit)}</td>
                <td className="px-4 py-3 text-right font-mono">{formatPercent(row.marginPct)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                  Tidak ada data untuk periode ini
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {hasEstimatedCost && (
        <p className="mt-2 text-xs text-slate-500">
          Sebagian HPP memakai harga modal saat ini (transaksi sebelum fitur ini)
        </p>
      )}
    </>
  )
}

export function ReportsPage() {
  const { user } = useAuth()
  const isOwner = user?.role === 'owner'

  const today = new Date()
  const monthAgo = new Date(today)
  monthAgo.setMonth(monthAgo.getMonth() - 1)
  const [startDate, setStartDate] = useState(localDateInputValue(monthAgo))
  const [endDate, setEndDate] = useState(localDateInputValue(today))
  const invalidRange = !startDate || !endDate || startDate > endDate
  const startQuery = startDate ? localDayIso(startDate) : ''
  const endQuery = endDate ? localDayIso(endDate, true) : ''

  const [tab, setTab] = useState<ReportTab>('sales')
  const [groupBy, setGroupBy] = useState<ProfitGroupBy>('product')
  const [form, setForm] = useState<FilterForm>(emptyFilterForm)

  // The Laba tab is owner-only — never leave a non-owner rendering it.
  const activeTab: ReportTab = tab === 'profit' && !isOwner ? 'sales' : tab

  const update = <K extends keyof FilterForm>(key: K, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const filters: ReportFilters = {
    cashierId: form.cashierId || undefined,
    paymentMethod: isPaymentMethod(form.paymentMethod) ? form.paymentMethod : undefined,
    status: isSaleStatus(form.status) ? form.status : undefined,
    categoryId: form.categoryId || undefined,
    productId: form.productId || undefined,
  }

  const range: ReportRange = { startDate, endDate, startQuery, endQuery }
  const hasFilters = Object.values(form).some(Boolean)

  // Filter pickers. The users endpoint is owner-only, so an admin simply sees
  // an empty cashier list instead of a broken page.
  const { data: users } = useUsers({ enabled: isOwner })
  const { data: categories } = useCategories()
  const { data: productsData } = useProducts({ limit: 100 })

  const cashierOptions = [...(users ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((u) => ({ value: u.id, label: u.name }))
  const categoryOptions = (categories ?? []).map((c) => ({ value: c.id, label: c.name }))
  const productOptions = (productsData?.data ?? []).map((p) => ({ value: p.id, label: p.name }))

  const availableTabs: { key: ReportTab; label: string }[] = [
    { key: 'sales', label: 'Penjualan' },
    { key: 'cashiers', label: 'Per Kasir' },
    ...(isOwner ? [{ key: 'profit' as const, label: 'Laba' }] : []),
  ]

  const exports =
    activeTab === 'sales'
      ? [
          // PRD §9.9 — CSV export
          { key: 'csv', label: 'Ekspor CSV', icon: Download, url: salesReportExportUrl(range, filters, 'csv') },
          // Printable HTML report — user saves as PDF via browser print dialog.
          { key: 'pdf', label: 'Ekspor PDF', icon: FileText, url: salesReportExportUrl(range, filters, 'html') },
        ]
      : activeTab === 'cashiers'
        ? [{ key: 'csv', label: 'Ekspor CSV', icon: Download, url: cashiersReportExportUrl(range, filters, 'csv') }]
        : [{ key: 'csv', label: 'Ekspor CSV', icon: Download, url: profitReportExportUrl(range, groupBy, filters, 'csv') }]

  return (
    <div>
      <PageHeader title="Laporan Penjualan" subtitle="Rangkuman penjualan per periode">
        <div className="flex gap-2">
          {exports.map(({ key, label, icon: Icon, url }) => (
            <Button key={key} variant="secondary" onClick={() => window.open(url, '_blank')} disabled={invalidRange}>
              <Icon className="h-4 w-4" /> {label}
            </Button>
          ))}
        </div>
      </PageHeader>

      {/* Tabs */}
      <div className="mb-4 inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm" role="tablist" aria-label="Jenis laporan">
        {availableTabs.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={activeTab === key}
            onClick={() => setTab(key)}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-bold transition-colors',
              activeTab === key ? 'bg-primary-600 text-white' : 'text-slate-600 hover:bg-slate-100',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="card mb-4 p-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            label="Dari"
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            max={endDate || undefined}
          />
          <Input
            label="Sampai"
            type="date"
            required
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            min={startDate || undefined}
          />
          <Select
            label="Kasir"
            placeholder="Semua kasir"
            options={cashierOptions}
            value={form.cashierId}
            onChange={(e) => update('cashierId', e.target.value)}
          />
          <Select
            label="Metode Bayar"
            placeholder="Semua metode"
            options={paymentMethodOptions}
            value={form.paymentMethod}
            onChange={(e) => update('paymentMethod', e.target.value)}
          />
          <Select
            label="Status"
            placeholder="Semua status"
            options={statusOptions}
            value={form.status}
            onChange={(e) => update('status', e.target.value)}
          />
          <Select
            label="Kategori"
            placeholder="Semua kategori"
            options={categoryOptions}
            value={form.categoryId}
            onChange={(e) => update('categoryId', e.target.value)}
          />
          <Select
            label="Produk"
            placeholder="Semua produk"
            options={productOptions}
            value={form.productId}
            onChange={(e) => update('productId', e.target.value)}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={() => setForm(emptyFilterForm)}>
              Reset filter
            </Button>
          )}
          {invalidRange && (
            <p className="text-sm font-bold text-red-600" role="alert">
              {!startDate || !endDate
                ? 'Pilih tanggal awal dan akhir.'
                : 'Tanggal awal tidak boleh setelah tanggal akhir.'}
            </p>
          )}
        </div>
      </div>

      {invalidRange ? null : activeTab === 'sales' ? (
        <SalesTab range={range} filters={filters} />
      ) : activeTab === 'cashiers' ? (
        <CashiersTab range={range} filters={filters} />
      ) : (
        <ProfitTab
          range={range}
          filters={filters}
          groupBy={groupBy}
          onGroupByChange={setGroupBy}
        />
      )}
    </div>
  )
}
