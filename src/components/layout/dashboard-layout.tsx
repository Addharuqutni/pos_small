import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import { OfflineBanner } from '@/components/offline-banner'
import {
  LayoutDashboard,
  Package,
  Tags,
  BarChart3,
  Users,
  Settings,
  ShoppingCart,
  Warehouse,
  LogOut,
  Menu,
  X,
  Clock,
  TicketPercent,
  Truck,
  Bell,
} from 'lucide-react'
import { useState } from 'react'
import { roleLabels } from '@/types'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dasbor', end: true },
  { to: '/dashboard/products', icon: Package, label: 'Produk' },
  { to: '/dashboard/categories', icon: Tags, label: 'Kategori' },
  { to: '/dashboard/stock', icon: Warehouse, label: 'Stok' },
  { to: '/dashboard/purchases', icon: Truck, label: 'Pembelian' },
  { to: '/dashboard/suppliers', icon: Users, label: 'Supplier' },
  { to: '/dashboard/promos', icon: TicketPercent, label: 'Promo' },
  { to: '/dashboard/sales', icon: ShoppingCart, label: 'Transaksi' },
  { to: '/dashboard/reports', icon: BarChart3, label: 'Laporan' },
  { to: '/dashboard/shifts', icon: Clock, label: 'Shift' },
  { to: '/dashboard/users', icon: Users, label: 'Pengguna' },
  { to: '/dashboard/settings', icon: Settings, label: 'Pengaturan' },
]

export function DashboardLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Store name from settings — fallback to generic brand while loading
  const { data: settings } = useQuery({
    queryKey: queryKeys.settings.all,
    queryFn: () => api.get<{ storeName: string }>('/settings'),
    staleTime: 10 * 60 * 1000,
  })
  const storeName = settings?.storeName || 'Aplikasi POS'

  // Low-stock notification — polled so owner/admin see stock alerts promptly.
  const { data: lowStock } = useQuery({
    queryKey: queryKeys.reports.lowStock(),
    queryFn: () => api.get<unknown[]>('/reports/low-stock'),
    refetchInterval: 60_000,
  })
  const lowStockCount = lowStock?.length ?? 0

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  // Filter nav by role — PRD §6.3
  const filteredNav = navItems.filter((item) => {
    if (user?.role === 'admin') {
      // Admin: no users, no settings
      return item.to !== '/dashboard/users' && item.to !== '/dashboard/settings'
    }
    return true // owner sees all
  })

  return (
    <div className="flex h-screen overflow-hidden bg-pos-bg">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-slate-950/45 backdrop-blur-[1px] lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-pos-sidebar transition-transform lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-500 text-[0.68rem] font-extrabold tracking-tight text-white">
            PC
          </div>
          <div className="min-w-0">
            <span className="block truncate font-display text-base font-semibold text-white">{storeName}</span>
            <span className="block text-[0.65rem] font-bold uppercase tracking-[0.14em] text-slate-500">Konsol ritel</span>
          </div>
          <button
            className="ml-auto inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Tutup menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
          {filteredNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-sm font-bold transition-colors',
                  isActive
                    ? 'border-primary-400/20 bg-primary-500/15 text-primary-200'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white',
                )
              }
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="border-t border-white/10 p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-500/20 text-sm font-extrabold text-primary-200">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{user?.name}</p>
              <p className="text-xs capitalize text-slate-400">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            Keluar
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <OfflineBanner />
        {/* Top bar */}
        <header className="flex h-16 items-center gap-4 border-b border-slate-200/80 bg-white/85 px-4 backdrop-blur sm:px-6">
          <button
            className="icon-button lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Buka menu"
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex-1" />
          <NavLink
            to="/dashboard/stock"
            className="relative rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100"
            aria-label={`Stok menipis: ${lowStockCount} produk`}
            title="Stok menipis"
          >
            <Bell className="h-5 w-5" />
            {lowStockCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold text-white">
                {lowStockCount}
              </span>
            )}
          </NavLink>
          <span className="hidden text-sm font-semibold text-slate-500 sm:block">
            {user?.name} · <span className="capitalize">{user ? roleLabels[user.role] : ''}</span>
          </span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
