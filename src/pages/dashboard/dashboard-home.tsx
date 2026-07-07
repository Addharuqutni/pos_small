import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { AlertTriangle, BarChart3, ShoppingCart, TrendingUp } from 'lucide-react'
import { formatCurrency, formatDate, localDateInputValue, localDayIso } from '@/lib/utils'
import { PageSpinner } from '@/components/ui'
import type { PaginatedResponse, Sale, SalesReportResponse, ProductReportRow } from '@/types'
import { saleStatusLabels, saleStatusBadgeClass } from '@/types'

interface LowStockProduct {
  id: string
  name: string
  sku: string | null
  stock: number
  minStock: number
}

function lastSevenDays(today = new Date()) {
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(today)
    day.setDate(today.getDate() - (6 - index))
    return localDateInputValue(day)
  })
}

function barHeight(value: number, max: number) {
  if (value <= 0 || max <= 0) return 8
  return Math.max(8, Math.round((value / max) * 100))
}

function ErrorNote({ children }: { children: string }) {
  return (
    <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
      {children}
    </div>
  )
}

function InlineLoading({ children }: { children: string }) {
  return <p className="py-8 text-center text-sm text-slate-400">{children}</p>
}

function SectionTitle({ title, subtitle, to }: { title: string; subtitle: string; to?: string }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>
      {to && (
        <Link to={to} className="shrink-0 text-sm font-medium text-primary-600 hover:underline">
          Lihat semua
        </Link>
      )}
    </div>
  )
}

/** PRD §8.2 — Dashboard home: overview cards */
export function DashboardHomePage() {
  const { user } = useAuth()
  const days = lastSevenDays()
  const startDate = days[0]!
  const endDate = days[days.length - 1]!
  const startQuery = localDayIso(startDate)
  const endQuery = localDayIso(endDate, true)

  const salesQuery = useQuery({
    queryKey: queryKeys.reports.sales({ startDate, endDate }),
    queryFn: () => api.get<SalesReportResponse>(`/reports/sales?start=${startQuery}&end=${endQuery}`),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  })

  const productsQuery = useQuery({
    queryKey: queryKeys.reports.products({ startDate, endDate }),
    queryFn: () => api.get<ProductReportRow[]>(`/reports/products?start=${startQuery}&end=${endQuery}`),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  })

  const lowStockQuery = useQuery({
    queryKey: queryKeys.reports.lowStock(),
    queryFn: () => api.get<LowStockProduct[]>('/reports/low-stock'),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  })

  const recentSalesQuery = useQuery({
    queryKey: queryKeys.sales.list({ limit: 5 }),
    queryFn: () => api.get<PaginatedResponse<Sale>>('/sales?limit=5'),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  })

  if (salesQuery.isLoading) return <PageSpinner />

  const dailyByDate = new Map((salesQuery.data?.daily ?? []).map((row) => [row.date, row]))
  const dailyRows = days.map((date) => {
    const row = dailyByDate.get(date)
    return {
      date,
      totalSales: row?.totalSales ?? 0,
      totalRevenue: row?.totalRevenue ?? 0,
    }
  })
  const maxRevenue = Math.max(...dailyRows.map((row) => row.totalRevenue), 0)
  const totalSales = salesQuery.data?.summary?.totalSales ?? 0
  const totalRevenue = salesQuery.data?.summary?.totalRevenue ?? 0
  const averageSale = totalSales > 0 ? Math.round(totalRevenue / totalSales) : 0
  const lowStock = lowStockQuery.data ?? []
  const topProducts = (productsQuery.data ?? []).slice(0, 5)
  const recentSales = recentSalesQuery.data?.data ?? []

  const stats = [
    { label: 'Omzet 7 Hari', value: formatCurrency(totalRevenue), icon: ShoppingCart, color: 'bg-blue-50 text-blue-600' },
    { label: 'Transaksi 7 Hari', value: String(totalSales), icon: BarChart3, color: 'bg-green-50 text-green-600' },
    { label: 'Rata-rata Transaksi', value: formatCurrency(averageSale), icon: TrendingUp, color: 'bg-amber-50 text-amber-600' },
    { label: 'Stok Rendah', value: String(lowStock.length), icon: AlertTriangle, color: 'bg-red-50 text-red-600' },
  ]

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Selamat datang, {user?.name}
          </h1>
          <p className="text-sm text-slate-500">
            Ringkasan {startDate.slice(5)} sampai {endDate.slice(5)}
          </p>
        </div>
        <Link to="/dashboard/reports" className="btn-secondary w-full sm:w-auto">
          Buka laporan
        </Link>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="card flex items-center justify-between gap-4 p-5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-500">{stat.label}</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{stat.value}</p>
            </div>
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${stat.color}`}>
              <stat.icon className="h-6 w-6" />
            </div>
          </div>
        ))}
      </div>

      {salesQuery.isError && (
        <div className="mb-6">
          <ErrorNote>Gagal memuat ringkasan penjualan.</ErrorNote>
        </div>
      )}

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <SectionTitle title="Tren Omzet Harian" subtitle="7 hari terakhir" to="/dashboard/reports" />

          {totalSales === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">Belum ada transaksi 7 hari terakhir</p>
          ) : (
            <div className="flex h-64 items-end gap-2 sm:gap-3" aria-label={`Grafik omzet harian dari ${startDate} sampai ${endDate}`}>
              {dailyRows.map((row) => (
                <div key={row.date} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                  <div className="flex h-36 w-full items-end rounded-xl bg-slate-50 px-1.5 py-1 ring-1 ring-slate-100 sm:px-2">
                    <div
                      className="w-full rounded-t-md bg-primary-500 transition-all"
                      style={{ height: `${barHeight(row.totalRevenue, maxRevenue)}%` }}
                      title={`${row.date}: ${formatCurrency(row.totalRevenue)}`}
                    />
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-medium text-slate-700">{row.date.slice(5)}</p>
                    <p className="hidden text-[11px] text-slate-500 sm:block">{formatCurrency(row.totalRevenue)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <SectionTitle title="Produk Terlaris" subtitle="Top 5 berdasarkan qty" to="/dashboard/reports" />

          {productsQuery.isLoading ? (
            <InlineLoading>Memuat produk terlaris...</InlineLoading>
          ) : productsQuery.isError ? (
            <ErrorNote>Gagal memuat produk terlaris.</ErrorNote>
          ) : topProducts.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Belum ada produk terjual 7 hari terakhir</p>
          ) : (
            <div className="space-y-3">
              {topProducts.map((product) => (
                <div key={product.productId} className="rounded-lg border border-slate-100 p-3">
                  <p className="font-medium text-slate-900">{product.productName}</p>
                  <div className="mt-1 flex justify-between text-sm text-slate-500">
                    <span>{product.totalQty} terjual</span>
                    <span className="font-mono">{formatCurrency(product.totalRevenue)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card overflow-hidden p-0">
          <div className="border-b border-slate-100 p-4">
            <SectionTitle title="Transaksi Terbaru" subtitle="5 transaksi terakhir" to="/dashboard/sales" />
          </div>

          {recentSalesQuery.isLoading ? (
            <InlineLoading>Memuat transaksi terbaru...</InlineLoading>
          ) : recentSalesQuery.isError ? (
            <div className="p-4">
              <ErrorNote>Gagal memuat transaksi terbaru.</ErrorNote>
            </div>
          ) : recentSales.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">Belum ada transaksi</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left">
                    <th className="px-4 py-3 font-medium text-slate-600">Invoice</th>
                    <th className="px-4 py-3 font-medium text-slate-600">Kasir</th>
                    <th className="px-4 py-3 font-medium text-slate-600 text-right">Total</th>
                    <th className="px-4 py-3 font-medium text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSales.map((sale) => {
                    const status = {
                      label: saleStatusLabels[sale.status] ?? sale.status,
                      className: saleStatusBadgeClass[sale.status] ?? 'bg-slate-100 text-slate-600',
                    }
                    return (
                      <tr key={sale.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-3">
                          <Link to={`/dashboard/sales/${sale.id}`} className="font-mono text-xs text-primary-600 hover:underline">
                            {sale.invoiceNo}
                          </Link>
                          <p className="mt-1 text-xs text-slate-500">{formatDate(sale.createdAt)}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{sale.cashier?.name ?? '-'}</td>
                        <td className="px-4 py-3 text-right font-mono font-medium">{formatCurrency(sale.grandTotal)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}>
                            {status.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card">
          <SectionTitle title="Peringatan Stok" subtitle="Produk mencapai stok minimum" to="/dashboard/stock" />

          {lowStockQuery.isLoading ? (
            <InlineLoading>Memuat peringatan stok...</InlineLoading>
          ) : lowStockQuery.isError ? (
            <ErrorNote>Gagal memuat stok rendah.</ErrorNote>
          ) : lowStock.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">Semua stok aman</p>
          ) : (
            <div className="space-y-3">
              {lowStock.slice(0, 5).map((product) => (
                <div key={product.id} className="flex items-center justify-between gap-4 rounded-lg border border-red-100 bg-red-50 p-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{product.name}</p>
                    <p className="text-xs text-slate-500">SKU: {product.sku ?? '-'}</p>
                  </div>
                  <p className="shrink-0 text-sm font-medium text-red-700">
                    {product.stock} / min {product.minStock}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
