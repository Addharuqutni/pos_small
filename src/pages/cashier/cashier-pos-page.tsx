import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError, api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { useAuth } from '@/contexts/auth-context'
import { useCart } from '@/contexts/cart-context'
import { useDebounce } from '@/hooks/use-debounce'
import { formatCurrency } from '@/lib/utils'
import { Button, Input, Modal } from '@/components/ui'
import { Receipt } from '@/components/receipt/receipt'
import {
  Search, Trash2, Plus, Minus, LogOut, CreditCard,
  Banknote, QrCode, ArrowRightLeft, Printer,
} from 'lucide-react'
import type { Product, Sale, Shift, PaymentMethod, PaginatedResponse, StoreSettings } from '@/types'

export function CashierPosPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { items, addItem, removeItem, updateQty, clearCart, subtotal, discountTotal, itemCount } = useCart()

  const [search, setSearch] = useState('')
  const [showPayment, setShowPayment] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [cashReceived, setCashReceived] = useState('')
  const [completedSale, setCompletedSale] = useState<Sale | null>(null)
  const [shiftError, setShiftError] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const debouncedSearch = useDebounce(search, 200)

  // Check active shift from API
  const { data: activeShift } = useQuery({
    queryKey: queryKeys.shifts.active,
    queryFn: async () => {
      try {
        const shift = await api.get<Shift>('/shifts/active')
        setShiftError('')
        return shift
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          setShiftError('')
          return null
        }
        setShiftError(err instanceof Error ? err.message : 'Gagal memuat shift')
        return null
      }
    },
    retry: false,
  })
  const shiftOpen = !!activeShift

  // PRD §10.4 — focus search on load for keyboard/barcode
  useEffect(() => { searchRef.current?.focus() }, [])

  const { data: settings } = useQuery({
    queryKey: queryKeys.settings.all,
    queryFn: () => api.get<StoreSettings>('/settings'),
    staleTime: 10 * 60 * 1000,
  })

  const { data: products } = useQuery({
    queryKey: queryKeys.products.list({ search: debouncedSearch, active: true }),
    queryFn: () => api.get<PaginatedResponse<Product>>(`/products?search=${encodeURIComponent(debouncedSearch)}&active=true`),
  })

  const checkoutMutation = useMutation({
    mutationFn: async (payload: {
      items: { productId: string; qty: number; discount: number }[]
      payments: { method: PaymentMethod; amount: number }[]
    }) => api.post<Sale>('/sales', payload),
    onSuccess: (sale) => {
      setCompletedSale(sale)
      clearCart()
      setShowPayment(false)
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.sales.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.reports.sales() })
      queryClient.invalidateQueries({ queryKey: queryKeys.reports.lowStock() })
      queryClient.invalidateQueries({ queryKey: queryKeys.reports.shifts() })
    },
  })

  const maxSellableQty = (product: Product) => {
    if (!product.trackStock || product.allowNegativeStock) return Number.MAX_SAFE_INTEGER
    return Math.max(0, product.stock)
  }

  const canSell = (product: Product) => maxSellableQty(product) > 0

  const setSafeQty = (product: Product, qty: number) => {
    const nextQty = Math.max(1, Math.floor(qty) || 1)
    updateQty(product.id, Math.min(nextQty, maxSellableQty(product)))
  }

  const addSafeItem = (product: Product) => {
    if (!canSell(product)) return
    const currentQty = items.find((item) => item.product.id === product.id)?.qty ?? 0
    if (currentQty >= maxSellableQty(product)) return
    addItem(product)
  }

  // Calculations
  const taxRate = settings?.taxEnabled ? settings.taxRate : 0
  const taxTotal = Math.round((subtotal - discountTotal) * taxRate / 100)
  const grandTotal = subtotal - discountTotal + taxTotal
  const cashReceivedNum = Math.max(0, parseInt(cashReceived) || 0)
  const change = paymentMethod === 'cash' ? Math.max(0, cashReceivedNum - grandTotal) : 0

  const canCheckout = shiftOpen && items.length > 0 && grandTotal > 0

  const handleCheckout = () => {
    if (!shiftOpen) return
    if (!canCheckout) return

    const invalidItem = items.find((item) => item.qty > maxSellableQty(item.product))
    if (invalidItem) return

    const paidAmount = paymentMethod === 'cash' ? cashReceivedNum : grandTotal
    if (paymentMethod === 'cash' && paidAmount < grandTotal) return

    checkoutMutation.mutate({
      items: items.map((i) => ({
        productId: i.product.id,
        qty: i.qty,
        discount: i.discount,
      })),
      payments: [{ method: paymentMethod, amount: paidAmount }],
    })
  }

  const handlePrint = () => {
    window.print()
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  // Barcode scan — if search matches exactly one product, add it
  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const product = products?.data?.[0]
    if (e.key === 'Enter' && product && products?.data?.length === 1) {
      addSafeItem(product)
      setSearch('')
    }
  }

  return (
    <>
      <div className="flex h-full flex-col overflow-y-auto bg-slate-100 lg:flex-row lg:overflow-hidden">
        {/* Left — Product search + grid */}
        <div className="flex min-h-[60vh] flex-1 flex-col overflow-hidden bg-slate-50 lg:min-h-0">
          {/* Top bar */}
          <div className="border-b border-slate-200 bg-white/95 px-4 py-4 shadow-sm backdrop-blur lg:px-5">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
              <div className="flex items-center justify-between gap-3 xl:w-56 xl:justify-start">
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-slate-950">Kasir</h1>
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    <span className={`rounded-full px-2.5 py-1 font-medium ${shiftOpen ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                      {shiftOpen ? 'Shift aktif' : 'Shift belum buka'}
                    </span>
                  </div>
                </div>
                <button onClick={handleLogout} className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 xl:hidden" aria-label="Keluar">
                  <LogOut className="h-5 w-5" />
                </button>
              </div>

              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-primary-500" />
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Cari produk atau scan barcode..."
                  className="input h-14 rounded-2xl border-slate-200 bg-slate-50 pl-12 text-base shadow-inner focus:bg-white"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  aria-label="Cari produk atau scan barcode"
                />
              </div>

              <div className="hidden items-center justify-end gap-3 xl:flex">
                <span className="max-w-40 truncate text-sm font-medium text-slate-600">{user?.name}</span>
                {shiftOpen && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => navigate('/cashier/shift/close')}
                  >
                    Tutup shift
                  </Button>
                )}
                <button onClick={handleLogout} className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500" aria-label="Keluar">
                  <LogOut className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3 xl:hidden">
              <span className="truncate text-sm font-medium text-slate-600">{user?.name}</span>
              {shiftOpen && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate('/cashier/shift/close')}
                >
                  Tutup shift
                </Button>
              )}
            </div>
          </div>

          {/* Product grid */}
          <div className="flex-1 overflow-y-auto p-4 lg:p-5">
            {products?.data ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                {products.data.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { addSafeItem(p); setSearch('') }}
                    className="group flex min-h-44 flex-col items-start rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 disabled:hover:border-slate-200 disabled:hover:shadow-sm"
                    disabled={!canSell(p)}
                  >
                    {p.imageData ? (
                      <img src={p.imageData} alt={p.name} className="mb-3 h-24 w-full rounded-xl object-cover" loading="lazy" />
                    ) : (
                      <div className="mb-3 flex h-24 w-full items-center justify-center rounded-xl bg-gradient-to-br from-primary-50 to-slate-100 text-2xl font-bold text-primary-300 group-hover:text-primary-500">
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="line-clamp-2 text-sm font-semibold leading-snug text-slate-950">{p.name}</span>
                    <span className="mt-1 min-h-4 text-xs text-slate-400">{p.barcode || p.sku || ''}</span>
                    <span className="mt-auto pt-3 text-base font-extrabold text-primary-700">
                      {formatCurrency(p.price)}
                    </span>
                    {p.trackStock && (
                      <span className={`mt-2 rounded-full px-2 py-0.5 text-xs font-medium ${p.stock <= p.minStock ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
                        Stok: {p.stock}
                      </span>
                    )}
                  </button>
                ))}
                {products.data.length === 0 && (
                  <div className="col-span-full rounded-2xl border border-dashed border-slate-200 bg-white py-12 text-center text-slate-400">
                    Produk tidak ditemukan
                  </div>
                )}
              </div>
            ) : (
              <div className="flex h-full min-h-80 items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white text-slate-300">
                <div className="text-center">
                  <Search className="mx-auto mb-3 h-12 w-12" />
                  <p className="font-medium">Ketik nama produk atau scan barcode</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right — Cart */}
        <div className="flex w-full flex-col border-t border-slate-200 bg-white shadow-2xl lg:w-[28rem] lg:border-l lg:border-t-0 xl:w-[30rem]">
          {/* Cart header */}
          <div className="border-b border-slate-200 bg-white px-4 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Keranjang</h2>
                <p className="text-sm text-slate-400">{itemCount} item dipilih</p>
              </div>
              {itemCount > 0 && (
                <span className="rounded-full bg-primary-50 px-3 py-1 text-sm font-bold text-primary-700">
                  {itemCount}
                </span>
              )}
            </div>
          </div>

          {/* Cart items */}
          <div className="max-h-[45vh] flex-1 overflow-y-auto lg:max-h-none">
            {items.length === 0 ? (
              <div className="flex h-full min-h-44 items-center justify-center p-4 text-sm text-slate-400">
                <div className="w-full rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
                  Keranjang kosong
                </div>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {items.map((item) => (
                  <div key={item.product.id} className="px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-950">{item.product.name}</p>
                        <p className="mt-0.5 text-xs text-slate-400">{formatCurrency(item.product.price)} / pcs</p>
                      </div>
                      <button onClick={() => removeItem(item.product.id)} className="rounded-lg p-2 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500" aria-label="Hapus item">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
                        <button
                          onClick={() => setSafeQty(item.product, item.qty - 1)}
                          className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-white disabled:text-slate-300"
                          disabled={item.qty <= 1}
                          aria-label="Kurangi qty"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <input
                          type="number"
                          min={1}
                          value={item.qty}
                          onChange={(e) => setSafeQty(item.product, parseInt(e.target.value) || 1)}
                          className="w-14 border-0 bg-transparent px-2 py-1 text-center text-sm font-bold text-slate-900 focus:outline-none focus:ring-0"
                          aria-label={`Qty ${item.product.name}`}
                        />
                        <button
                          onClick={() => setSafeQty(item.product, item.qty + 1)}
                          className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-white disabled:text-slate-300"
                          disabled={item.qty >= maxSellableQty(item.product)}
                          aria-label="Tambah qty"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                      <span className="text-sm font-bold text-slate-950">
                        {formatCurrency(item.product.price * item.qty - item.discount * item.qty)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cart footer — totals + pay button */}
          <div className="space-y-3 border-t border-slate-200 bg-gradient-to-b from-slate-50 to-white p-4">
            <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Subtotal</span>
                <span className="font-mono font-medium">{formatCurrency(subtotal)}</span>
              </div>
              {discountTotal > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Diskon Item</span>
                  <span className="font-mono font-medium text-red-600">-{formatCurrency(discountTotal)}</span>
                </div>
              )}
              {taxTotal > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Pajak ({settings?.taxRate}%)</span>
                  <span className="font-mono font-medium">{formatCurrency(taxTotal)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-200 pt-3 text-xl font-black">
                <span>Total</span>
                <span className="text-primary-700">{formatCurrency(grandTotal)}</span>
              </div>
            </div>

            {shiftError && (
              <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
                {shiftError}
              </div>
            )}

            {!shiftOpen && !shiftError && (
              <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                Shift belum dibuka. Buka shift sebelum transaksi.
                <button
                  type="button"
                  className="ml-2 font-semibold underline"
                  onClick={() => navigate('/cashier/shift/open')}
                >
                  Buka shift
                </button>
              </div>
            )}

            <Button
              className="h-14 w-full rounded-2xl text-lg font-bold shadow-lg shadow-primary-600/20"
              size="lg"
              disabled={!canCheckout}
              onClick={() => setShowPayment(true)}
            >
              <CreditCard className="h-5 w-5" /> Bayar
            </Button>
          </div>
        </div>
      </div>

      {/* Payment modal */}
      <Modal open={showPayment} onClose={() => setShowPayment(false)} title="Pembayaran" className="max-w-md rounded-2xl">
        <div className="space-y-5">
          <div className="rounded-2xl bg-primary-50 p-5 text-center">
            <p className="text-sm font-medium text-primary-600">Total Bayar</p>
            <p className="mt-1 text-3xl font-black text-primary-900">{formatCurrency(grandTotal)}</p>
          </div>

          {/* Payment method */}
          <div>
            <p className="label">Metode Pembayaran</p>
            <div className="grid grid-cols-3 gap-2">
              {([
                { method: 'cash' as const, icon: Banknote, label: 'Tunai' },
                { method: 'qris' as const, icon: QrCode, label: 'QRIS' },
                { method: 'transfer' as const, icon: ArrowRightLeft, label: 'Transfer' },
              ]).map(({ method, icon: Icon, label }) => (
                <button
                  key={method}
                  onClick={() => setPaymentMethod(method)}
                  className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border-2 p-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 ${
                    paymentMethod === method
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="h-6 w-6" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Cash input */}
          {paymentMethod === 'cash' && (
            <div>
              <Input
                label="Uang Diterima"
                type="number"
                min={grandTotal}
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                autoFocus
              />
              {cashReceivedNum >= grandTotal && (
                <p className="mt-3 rounded-xl bg-green-50 p-3 text-center text-lg font-bold text-green-700">
                  Kembalian: {formatCurrency(change)}
                </p>
              )}
            </div>
          )}

          <Button
            className="h-12 w-full rounded-2xl font-bold"
            size="lg"
            variant="success"
            loading={checkoutMutation.isPending}
            disabled={paymentMethod === 'cash' && cashReceivedNum < grandTotal}
            onClick={handleCheckout}
          >
            Simpan Transaksi
          </Button>

          {checkoutMutation.isError && (
            <p className="text-center text-sm text-red-600">
              {checkoutMutation.error instanceof Error ? checkoutMutation.error.message : 'Gagal menyimpan transaksi'}
            </p>
          )}
        </div>
      </Modal>

      {/* Completed sale — receipt */}
      <Modal open={!!completedSale} onClose={() => setCompletedSale(null)} title="Transaksi Berhasil" className="max-w-md rounded-2xl">
        {completedSale && (
          <div>
            <div className="mb-4 rounded-2xl bg-green-50 p-4 text-center text-green-700">
              <p className="font-bold">Transaksi berhasil disimpan</p>
              <p className="text-sm">{completedSale.invoiceNo}</p>
            </div>

            <Receipt sale={completedSale} settings={settings ?? null} />

            <div className="mt-4 flex gap-3">
              <Button variant="secondary" className="flex-1 rounded-xl" onClick={handlePrint}>
                <Printer className="h-4 w-4" /> Cetak Struk
              </Button>
              <Button className="flex-1 rounded-xl" onClick={() => { setCompletedSale(null); searchRef.current?.focus() }}>
                Transaksi Baru
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
