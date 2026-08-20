import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { AlertTriangle, BarChart3, ShoppingCart, TrendingUp } from 'lucide-react'
import { formatCurrency, formatDate, localDateInputValue, localDayIso } from '@/lib/utils'
import { PageHeader, PageSpinner, StatusBadge, ErrorState } from '@/components/ui'
import type { PaginatedResponse, Sale, SalesReportResponse, ProductReportRow, CategoryReportRow } from '@/types'
import { saleStatusLabels } from '@/types'

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

function niceChartMax(value: number) {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const normalized = value / magnitude
  const ceiling = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return ceiling * magnitude
}

const compactCurrency = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  notation: 'compact',
  maximumFractionDigits: 1,
})

interface RevenueChartRow {
  date: string
  totalSales: number
  totalRevenue: number
}

function RevenueChart({ rows, startDate, endDate }: { rows: RevenueChartRow[]; startDate: string; endDate: string }) {
  const width = 700
  const height = 260
  const margin = { top: 16, right: 16, bottom: 42, left: 64 }
  const plotWidth = width - margin.left - margin.right
  const plotHeight = height - margin.top - margin.bottom
  const max = niceChartMax(Math.max(...rows.map((row) => row.totalRevenue), 0))
  const points = rows.map((row, index) => ({
    ...row,
    x: margin.left + (index / Math.max(1, rows.length - 1)) * plotWidth,
    y: margin.top + plotHeight - (row.totalRevenue / max) * plotHeight,
  }))
  const linePoints = points.map(({ x, y }) => `${x},${y}`).join(' ')
  const areaPoints = `${margin.left},${margin.top + plotHeight} ${linePoints} ${margin.left + plotWidth},${margin.top + plotHeight}`
  const ticks = [0, 0.25, 0.5, 0.75, 1]

  return (
    <figure aria-labelledby="revenue-chart-title revenue-chart-description">
      <figcaption className="sr-only">
        <span id="revenue-chart-title">Grafik garis omzet harian</span>
        <span id="revenue-chart-description"> Periode {startDate} sampai {endDate}.</span>
      </figcaption>
      <div className="table-shell bg-slate-50/70 p-2 sm:p-3">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-hidden="true">
          <defs>
            <linearGradient id="revenue-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
            </linearGradient>
          </defs>

          {ticks.map((tick) => {
            const y = margin.top + plotHeight - tick * plotHeight
            return (
              <g key={tick}>
                <line x1={margin.left} x2={margin.left + plotWidth} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="4 6" />
                <text x={margin.left - 10} y={y + 4} textAnchor="end" className="fill-slate-400 text-[11px]">
                  {compactCurrency.format(max * tick)}
                </text>
              </g>
            )
          })}

          <polygon points={areaPoints} fill="url(#revenue-area)" />
          <polyline
            points={linePoints}
            fill="none"
            stroke="#2563eb"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {points.map((point) => (
            <g key={point.date}>
              <circle cx={point.x} cy={point.y} r="5" fill="white" stroke="#2563eb" strokeWidth="3">
                <title>{point.date}: {formatCurrency(point.totalRevenue)} dari {point.totalSales} transaksi</title>
              </circle>
              <text x={point.x} y={height - 14} textAnchor="middle" className="fill-slate-500 text-[11px] font-medium">
                {point.date.slice(5)}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-medium text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
          Lihat data grafik
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-slate-500">
              <tr><th className="py-2">Tanggal</th><th className="py-2 text-right">Transaksi</th><th className="py-2 text-right">Omzet</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.date} className="border-t border-slate-100">
                  <td className="py-2">{row.date}</td>
                  <td className="py-2 text-right">{row.totalSales}</td>
                  <td className="py-2 text-right font-mono">{formatCurrency(row.totalRevenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
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

function CategoryBars({ rows }: { rows: CategoryReportRow[] }) {
  const max = Math.max(...rows.map((r) => r.totalRevenue), 1)
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.categoryName}>
          <div className="mb-1 flex justify-between text-sm">
            <span className="truncate font-medium text-slate-900">{row.categoryName}</span>
            <span className="ml-3 shrink-0 font-mono text-slate-500">{formatCurrency(row.totalRevenue)}</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-primary-500"
              style={{ width: `${Math.max(4, (row.totalRevenue / max) * 100)}%` }}
            />
          </div>
          <p className="mt-0.5 text-xs text-slate-400">{row.totalQty} item terjual</p>
        </div>
      ))}
    </div>
  )
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

  const categoriesQuery = useQuery({
    queryKey: queryKeys.reports.categories({ startDate, endDate }),
    queryFn: () => api.get<CategoryReportRow[]>(`/reports/categories?start=${startQuery}&end=${endQuery}`),
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
  if (salesQuery.isError) {
    return (
      <ErrorState
        message="Gagal memuat ringkasan penjualan."
        onRetry={() => salesQuery.refetch()}
      />
    )
  }

  const dailyByDate = new Map((salesQuery.data?.daily ?? []).map((row) => [row.date, row]))
  const dailyRows = days.map((date) => {
    const row = dailyByDate.get(date)
    return {
      date,
      totalSales: row?.totalSales ?? 0,
      totalRevenue: row?.totalRevenue ?? 0,
    }
  })
  const totalSales = salesQuery.data?.summary?.totalSales ?? 0
  const totalRevenue = salesQuery.data?.summary?.totalRevenue ?? 0
  const averageSale = totalSales > 0 ? Math.round(totalRevenue / totalSales) : 0
  const lowStock = lowStockQuery.data ?? []
  const topProducts = (productsQuery.data ?? []).slice(0, 5)
  const categoryRows = categoriesQuery.data ?? []
  const recentSales = recentSalesQuery.data?.data ?? []

  const stats = [
    { label: 'Omzet 7 Hari', value: formatCurrency(totalRevenue), icon: ShoppingCart, color: 'bg-blue-50 text-blue-600' },
    { label: 'Transaksi 7 Hari', value: String(totalSales), icon: BarChart3, color: 'bg-green-50 text-green-600' },
    { label: 'Rata-rata Transaksi', value: formatCurrency(averageSale), icon: TrendingUp, color: 'bg-amber-50 text-amber-600' },
    { label: 'Stok Rendah', value: String(lowStock.length), icon: AlertTriangle, color: 'bg-red-50 text-red-600' },
  ]

  return (
    <div>
      <PageHeader
        title={`Selamat datang, ${user?.name ?? ''}`}
        subtitle={`Ringkasan ${startDate.slice(5)} sampai ${endDate.slice(5)}`}
      >
        <Link to="/dashboard/reports" className="btn-secondary w-full sm:w-auto">
          Buka laporan
        </Link>
      </PageHeader>

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
            <RevenueChart rows={dailyRows} startDate={startDate} endDate={endDate} />
          )}
        </section>

        <section className="card">
          <SectionTitle title="Produk Terlaris" subtitle="5 teratas berdasarkan jumlah" to="/dashboard/reports" />

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

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <section className="card">
          <SectionTitle title="Omzet per Kategori" subtitle="7 hari terakhir" to="/dashboard/reports" />
          {categoriesQuery.isLoading ? (
            <InlineLoading>Memuat kategori...</InlineLoading>
          ) : categoriesQuery.isError ? (
            <ErrorNote>Gagal memuat kategori.</ErrorNote>
          ) : categoryRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Belum ada penjualan 7 hari terakhir</p>
          ) : (
            <CategoryBars rows={categoryRows.slice(0, 6)} />
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="table-shell overflow-hidden p-0">
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
                    <th className="px-4 py-3 font-medium text-slate-600">Faktur</th>
                    <th className="px-4 py-3 font-medium text-slate-600">Kasir</th>
                    <th className="px-4 py-3 font-medium text-slate-600 text-right">Total</th>
                    <th className="px-4 py-3 font-medium text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSales.map((sale) => {
                    const tone = sale.status === 'paid'
                      ? 'green'
                      : sale.status === 'void' || sale.status === 'refunded'
                        ? 'red'
                        : 'amber'
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
                          <StatusBadge tone={tone}>{saleStatusLabels[sale.status]}</StatusBadge>
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
                    {product.stock} / minimal {product.minStock}
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
