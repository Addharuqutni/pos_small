import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { formatCurrency, formatDate } from '@/lib/utils'
import { PageSpinner } from '@/components/ui'
import { Link } from 'react-router-dom'
import type { Sale, PaginatedResponse } from '@/types'

const statusLabels: Record<string, { label: string; class: string }> = {
  paid: { label: 'Lunas', class: 'bg-green-50 text-green-700' },
  void: { label: 'Void', class: 'bg-red-50 text-red-700' },
  refunded: { label: 'Refund', class: 'bg-amber-50 text-amber-700' },
  partial_refunded: { label: 'Refund Sebagian', class: 'bg-amber-50 text-amber-700' },
}

export function SalesPage() {
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const salesPath = search ? `/sales?q=${encodeURIComponent(search)}` : '/sales'

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSearch(searchInput.trim())
  }

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.sales.list({ q: search || undefined }),
    queryFn: () => api.get<PaginatedResponse<Sale>>(salesPath),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  })

  if (isLoading) return <PageSpinner />

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Transaksi</h1>
        <p className="text-sm text-slate-500">Riwayat transaksi penjualan</p>
      </div>

      <form onSubmit={handleSearch} className="mb-4 flex gap-2">
        <input
          type="search"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Cari invoice atau kasir..."
          className="input max-w-sm"
        />
        <button type="submit" className="btn-primary">Cari</button>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left">
              <th className="px-4 py-3 font-medium text-slate-600">Invoice</th>
              <th className="px-4 py-3 font-medium text-slate-600">Waktu</th>
              <th className="px-4 py-3 font-medium text-slate-600">Kasir</th>
              <th className="px-4 py-3 font-medium text-slate-600 text-right">Total</th>
              <th className="px-4 py-3 font-medium text-slate-600">Status</th>
              <th className="px-4 py-3 font-medium text-slate-600">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {data?.data?.map((sale) => {
              const st = statusLabels[sale.status] ?? { label: sale.status, class: 'bg-slate-100 text-slate-600' }
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
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${st.class}`}>
                      {st.label}
                    </span>
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
                <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
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
