import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { formatCurrency, formatDate } from '@/lib/utils'
import { PageHeader, TableSkeleton, StatusBadge, ErrorState } from '@/components/ui'
import { Link } from 'react-router-dom'
import type { Sale, PaginatedResponse } from '@/types'

const statusLabels: Record<string, { label: string; tone: 'green' | 'red' | 'amber' | 'slate' }> = {
  paid: { label: 'Lunas', tone: 'green' },
  void: { label: 'Batal', tone: 'red' },
  refunded: { label: 'Pengembalian', tone: 'amber' },
  partial_refunded: { label: 'Pengembalian sebagian', tone: 'amber' },
}

export function SalesPage() {
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const salesPath = search ? `/sales?q=${encodeURIComponent(search)}` : '/sales'

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSearch(searchInput.trim())
  }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.sales.list({ q: search || undefined }),
    queryFn: () => api.get<PaginatedResponse<Sale>>(salesPath),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  })

  if (isLoading) return <TableSkeleton rows={7} />
  if (isError) return <ErrorState message="Gagal memuat transaksi." onRetry={() => refetch()} />

  return (
    <div>
      <PageHeader title="Transaksi" subtitle="Riwayat transaksi penjualan" />

      <form onSubmit={handleSearch} className="mb-4 flex gap-2">
        <input
          id="sales-search"
          name="sales-search"
          type="search"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Cari faktur atau kasir..."
          className="input max-w-sm"
          aria-label="Cari faktur atau kasir"
          autoComplete="off"
        />
        <button type="submit" className="btn-primary">Cari</button>
      </form>

      <div className="table-shell">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left">
              <th className="px-4 py-3 font-medium text-slate-600">Faktur</th>
              <th className="px-4 py-3 font-medium text-slate-600">Waktu</th>
              <th className="px-4 py-3 font-medium text-slate-600">Kasir</th>
              <th className="px-4 py-3 font-medium text-slate-600 text-right">Total</th>
              <th className="px-4 py-3 font-medium text-slate-600">Status</th>
              <th className="px-4 py-3 font-medium text-slate-600">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {data?.data?.map((sale) => {
              const st = statusLabels[sale.status] ?? { label: sale.status, tone: 'slate' as const }
              return (
                <tr key={sale.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link to={`/dashboard/sales/${sale.id}`} className="font-mono text-xs text-primary-600 hover:underline">
                      {sale.invoiceNo}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(sale.createdAt)}</td>
                  <td className="px-4 py-3 text-slate-700">{sale.cashier?.name ?? '-'}</td>
                  <td className="px-4 py-3 text-right font-mono font-medium">{formatCurrency(sale.grandTotal)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                  </td>
                  <td className="px-4 py-3">
                    <Link to={`/dashboard/sales/${sale.id}`} className="text-xs text-primary-600 hover:underline">
                      Detail
                    </Link>
                  </td>
                </tr>
              )
            })}
            {(!data?.data || data.data.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                  {search ? 'Transaksi tidak ditemukan' : 'Belum ada transaksi'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
